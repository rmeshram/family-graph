import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } }
  )
}

async function authedClient() {
  const cs = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cs.getAll(),
        setAll: (c) => {
          try { c.forEach(({ name, value, options }) => cs.set(name, value, options)) } catch { }
        },
      },
    }
  )
}

// POST /api/invites/[token]/claim
// Handles node-specific invite acceptance + identity verification.
// If unauthenticated, stores claim_intent cookie and signals redirect to auth.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params
  // Normalize to uppercase first so mixed-case tokens from URLs work correctly
  const token = (rawToken ?? '').toUpperCase()

  // Validate token format BEFORE doing anything (prevents cookie poisoning + DB hits with junk)
  if (!token || !/^[A-Z0-9]{4,16}$/.test(token)) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 400 })
  }

  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Store claim intent cookie so auth/callback can resume
    const response = NextResponse.json(
      { error: 'UNAUTHENTICATED', action: 'REDIRECT_TO_AUTH' },
      { status: 401 }
    )
    response.cookies.set('claim_intent', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    })
    return response
  }

  const admin = adminClient()

  // Validate invite
  const { data: invite } = await admin
    .from('invite_links')
    .select('*, family_members(id, name, birth_year, claim_status, is_deceased, family_id)')
    .eq('code', token)
    .single()

  if (!invite) return NextResponse.json({ error: 'INVITE_NOT_FOUND' }, { status: 404 })

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'INVITE_EXPIRED', message: 'This invite link has expired. Ask the sender for a new one.' },
      { status: 410 }
    )
  }
  if ((invite as any).consumed_at) {
    return NextResponse.json({ error: 'INVITE_CONSUMED' }, { status: 409 })
  }
  if ((invite as any).invite_type !== 'node_claim' || !(invite as any).node_id) {
    return NextResponse.json({ error: 'NOT_NODE_CLAIM_INVITE' }, { status: 400 })
  }

  const node = (invite as any).family_members
  if (!node) return NextResponse.json({ error: 'NODE_NOT_FOUND' }, { status: 404 })
  if (node.is_deceased) return NextResponse.json({ error: 'NODE_DECEASED' }, { status: 409 })
  if (node.claim_status === 'claimed') return NextResponse.json({ error: 'ALREADY_CLAIMED' }, { status: 409 })

  let body: { submittedName?: string; submittedBirthYear?: number }
  try { body = await req.json() } catch { body = {} }

  // RF-05: Atomically mark invite consumed BEFORE calling the node claim route.
  // Using WHERE consumed_at IS NULL prevents two simultaneous requests from both
  // succeeding — the second request finds 0 rows updated and returns INVITE_CONSUMED.
  const consumedAt = new Date().toISOString()
  const { data: consumeResult, error: consumeErr } = await admin
    .from('invite_links')
    .update({ consumed_at: consumedAt, consumed_by: user.id } as any)
    .eq('id', (invite as any).id)
    .is('consumed_at', null)
    .select('id')

  if (consumeErr || !(consumeResult as any[])?.length) {
    return NextResponse.json(
      { error: 'INVITE_CONSUMED', message: 'This invite has already been used. Ask the family admin for a fresh invite.' },
      { status: 409 }
    )
  }

  // EC-06: Warn loudly if NEXT_PUBLIC_APP_URL is not set. In production, using
  // req.nextUrl.origin behind a proxy may resolve to http://localhost:3000,
  // causing the internal fetch to ECONNREFUSED and returning an unhandled 500.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.warn('[invites/claim] NEXT_PUBLIC_APP_URL is not set; falling back to', appUrl, '- set this env var in production to prevent routing failures')
  }
  const claimRes = await fetch(`${appUrl}/api/nodes/${node.id}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      submittedName: body.submittedName,
      submittedBirthYear: body.submittedBirthYear,
      inviteCode: token,  // RF-01: enables authorizedViaNodeClaimInvite path in node claim route
    }),
  })
  const claimData = await claimRes.json()

  if (claimRes.ok) {
    // Update used_count — consumed_at was already set atomically above.
    await admin.from('invite_links').update({
      used_count: ((invite as any).used_count ?? 0) + 1,
    } as any).eq('id', (invite as any).id)
    // HIGH-11: Do NOT insert a second claim_audit_log row here.
    // The node claim route already inserts action='claim_completed' for every
    // successful claim. Inserting again here produces a duplicate record for
    // the same operation, polluting the audit trail.
  } else {
    // RF-05: Rollback — restore the invite so the user can retry or the admin can re-send.
    await admin.from('invite_links')
      .update({ consumed_at: null, consumed_by: null } as any)
      .eq('id', (invite as any).id)
      .eq('consumed_at', consumedAt) // guard: only roll back our own lock, not a concurrent update
  }

  return NextResponse.json(claimData, { status: claimRes.status })
}
