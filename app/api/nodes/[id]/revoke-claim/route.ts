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

// POST /api/nodes/[id]/revoke-claim
// Tree admin or family owner only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { reason?: string }
  try { body = await req.json() } catch { body = {} }

  const admin = adminClient()

  const { data: node } = await admin
    .from('family_members')
    .select('id, claim_status, is_claimed, claimed_by_user_id, family_id')
    .eq('id', id)
    .single()
  if (!node) return NextResponse.json({ error: 'NODE_NOT_FOUND' }, { status: 404 })

  const { data: profile } = await admin
    .from('profiles')
    .select('role, family_id')
    .eq('id', user.id)
    .single()

  const isAdmin = (profile as any)?.role === 'admin'
  const isSameFamily = (profile as any)?.family_id === (node as any).family_id
  // Both conditions must be true: caller must be an admin AND belong to the same family.
  if (!isAdmin || !isSameFamily)
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const revocableStatuses = ['claimed', 'claim_pending', 'invite_sent']
  const nodeIsClaimed =
    revocableStatuses.includes((node as any).claim_status) ||
    (node as any).is_claimed === true
  if (!nodeIsClaimed)
    return NextResponse.json({ error: 'NOT_CLAIMED' }, { status: 409 })

  const revokedAt = new Date().toISOString()

  // Expire any outstanding invite_links for this node regardless of claim state.
  await admin.from('invite_links')
    .update({ consumed_at: revokedAt } as any)
    .eq('node_id', id)
    .is('consumed_at', null)

  await admin.from('family_members').update({
    claim_status: 'revoked',
    is_claimed: false,
    claimed_by_user_id: null,
    claim_revoked_at: revokedAt,
    claim_revoked_by: user.id,
    claim_revoke_reason: body.reason ?? null,
  } as any).eq('id', id)

  await admin.from('claim_requests')
    .update({ status: 'rejected', updated_at: revokedAt } as any)
    .eq('node_id', id)
    .neq('status', 'rejected')

  await admin.from('user_node_links').delete().eq('node_id', id)

  // Clear profiles.member_id for the user whose claim was just revoked so the
  // app immediately stops showing stale "Unlink My Profile" UI for that user.
  const revokedUserId = (node as any).claimed_by_user_id as string | null
  if (revokedUserId) {
    await admin
      .from('profiles')
      .update({ member_id: null } as any)
      .eq('id', revokedUserId)
      .eq('member_id', id) // guard: only clear if still pointing at this node
  }

  await admin.from('claim_audit_log').insert({
    node_id: id,
    family_id: (node as any).family_id,
    actor_id: user.id,
    action: 'claim_revoked',
    metadata: {
      reason: body.reason,
      revokedFromUserId: (node as any).claimed_by_user_id,
    },
  })

  return NextResponse.json({ status: 'revoked', revokedAt })
}
