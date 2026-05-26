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

const GRACE_DAYS = 7

// POST /api/nodes/[id]/unclaim
// Only the claimer can unclaim, and only within the 7-day grace window.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()
  const { data: node } = await admin
    .from('family_members')
    .select('id, claim_status, claimed_by_user_id, claimed_at, family_id')
    .eq('id', id)
    .single()

  if (!node) return NextResponse.json({ error: 'NODE_NOT_FOUND' }, { status: 404 })
  if ((node as any).claimed_by_user_id !== user.id)
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  if ((node as any).claim_status !== 'claimed')
    return NextResponse.json({ error: 'NOT_CLAIMED' }, { status: 409 })

  const claimedAt = (node as any).claimed_at ? new Date((node as any).claimed_at) : null
  if (claimedAt && Date.now() - claimedAt.getTime() > GRACE_DAYS * 86_400_000) {
    return NextResponse.json(
      {
        error: 'GRACE_PERIOD_EXPIRED',
        message: `The ${GRACE_DAYS}-day unclaim window has passed. Contact the tree owner.`,
      },
      { status: 409 }
    )
  }

  await admin.from('family_members')
    .update({ claim_status: 'unclaimed', is_claimed: false, claimed_by_user_id: null, claimed_at: null } as any)
    .eq('id', id)

  await admin.from('claim_requests')
    .update({ status: 'abandoned', updated_at: new Date().toISOString() } as any)
    .eq('node_id', id)
    .eq('claimant_user_id', user.id)

  await admin.from('user_node_links').delete().eq('user_id', user.id).eq('node_id', id)

  // Reset the user's profile member_id so the app stops treating this node as theirs
  await admin.from('profiles')
    .update({ member_id: null } as any)
    .eq('id', user.id)

  await admin.from('claim_audit_log').insert({
    node_id: id,
    family_id: (node as any).family_id,
    actor_id: user.id,
    action: 'claim_unclaimed',
    metadata: { reason: 'user_initiated' },
  })

  return NextResponse.json({ status: 'unclaimed' })
}
