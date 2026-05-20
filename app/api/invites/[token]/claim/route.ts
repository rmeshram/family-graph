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
  const { token } = await params

  // Validate token format BEFORE doing anything (prevents cookie poisoning + DB hits with junk)
  if (!token || !/^[A-Z0-9]{4,16}$/.test(token.toUpperCase())) {
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
    .eq('code', token.toUpperCase())
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

  // Delegate to the node claim route (shares the identity scoring logic)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  const claimRes = await fetch(`${appUrl}/api/nodes/${node.id}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      submittedName: body.submittedName,
      submittedBirthYear: body.submittedBirthYear,
    }),
  })
  const claimData = await claimRes.json()

  if (claimRes.ok) {
    await admin.from('invite_links').update({
      consumed_at: new Date().toISOString(),
      consumed_by: user.id,
      used_count: (invite.used_count ?? 0) + 1,
    } as any).eq('id', invite.id)

    await admin.from('claim_audit_log').insert({
      node_id: node.id,
      family_id: node.family_id,
      actor_id: user.id,
      action: 'claim_completed',
      metadata: { via: 'invite', inviteId: invite.id },
    })
  }

  return NextResponse.json(claimData, { status: claimRes.status })
}
