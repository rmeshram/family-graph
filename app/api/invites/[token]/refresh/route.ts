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

function randomCode(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase()
}

// POST /api/invites/[token]/refresh
// Inviter renews an expired node-claim invite. Archives the old one.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()
  const { data: invite } = await admin
    .from('invite_links')
    .select('*')
    .eq('code', token.toUpperCase())
    .single()

  if (!invite) return NextResponse.json({ error: 'INVITE_NOT_FOUND' }, { status: 404 })
  if (invite.created_by !== user.id)
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const newCode = randomCode(8)
  const newExpiry = new Date(Date.now() + 72 * 3_600_000).toISOString()

  const { data: newInvite } = await admin.from('invite_links').insert({
    family_id: invite.family_id,
    code: newCode,
    role: invite.role,
    created_by: user.id,
    expires_at: newExpiry,
    max_uses: invite.max_uses ?? 1,
    node_id: (invite as any).node_id ?? null,
    invite_type: (invite as any).invite_type ?? 'family',
    identity_hint: (invite as any).identity_hint ?? null,
  } as any).select().single()

  // Archive old invite
  await admin.from('invite_links')
    .update({ consumed_at: new Date().toISOString() } as any)
    .eq('id', invite.id)

  // Update node status back to invite_sent if applicable
  if ((invite as any).node_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fmQuery = admin.from('family_members') as any
    await fmQuery
      .update({ claim_status: 'invite_sent' })
      .eq('id', (invite as any).node_id)
      .eq('claim_status', 'unclaimed')

    await admin.from('claim_audit_log').insert({
      node_id: (invite as any).node_id,
      actor_id: user.id,
      family_id: invite.family_id,
      action: 'invite_refreshed',
      metadata: { oldCode: token, newCode },
    })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return NextResponse.json({
    code: newCode,
    link: `${appUrl}/join/${newCode}`,
    expiresAt: newExpiry,
  })
}
