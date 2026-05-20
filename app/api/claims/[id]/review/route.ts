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

/**
 * POST /api/claims/[id]/review
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * approve:
 *   claim_requests.status = 'verified'
 *   family_members.claim_status = 'claimed', claimed_by_user_id, claimed_at
 *   user_node_links upsert (is_primary = true)
 *   profiles.member_id = node_id
 *   claim_audit_log 'claim_verified'
 *
 * reject:
 *   claim_requests.status = 'rejected'
 *   family_members.claim_status = 'unclaimed' (reset to allow future claims)
 *   claim_audit_log 'claim_rejected'
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { action?: string; reason?: string }
  try { body = await req.json() } catch { body = {} }

  const { action, reason } = body
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const admin = adminClient()

  // Verify reviewer is admin of the node's family
  const { data: profile } = await admin
    .from('profiles')
    .select('role, family_id')
    .eq('id', user.id)
    .single()
  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }
  const familyId: string = (profile as any).family_id

  // Load the claim request
  const { data: claim } = await admin
    .from('claim_requests')
    .select('id, node_id, claimant_user_id, status')
    .eq('id', id)
    .single()
  if (!claim) return NextResponse.json({ error: 'CLAIM_NOT_FOUND' }, { status: 404 })
  if ((claim as any).status !== 'pending') {
    return NextResponse.json({ error: 'CLAIM_NOT_PENDING' }, { status: 409 })
  }

  // Verify the node belongs to this admin's family
  const { data: node } = await admin
    .from('family_members')
    .select('id, family_id, claim_status, claimed_by_user_id')
    .eq('id', (claim as any).node_id)
    .single()
  if (!node || (node as any).family_id !== familyId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const claimantUserId: string = (claim as any).claimant_user_id
  const nodeId: string = (claim as any).node_id

  if (action === 'approve') {
    const now = new Date().toISOString()

    // C1/C2: Perform all dependent writes FIRST so that if any fail, the
    // claim_requests row stays 'pending' and the admin can retry. Mark
    // claim_requests='verified' only as the final commit step (still under the
    // optimistic lock at the very end).

    // First confirm the claim is still pending (cheap check; the real guard is
    // the optimistic update at the bottom).
    const { data: lockCheck } = await admin
      .from('claim_requests')
      .select('status')
      .eq('id', id)
      .single()
    if ((lockCheck as any)?.status !== 'pending') {
      return NextResponse.json({ error: 'CLAIM_ALREADY_REVIEWED' }, { status: 409 })
    }

    // 1. Update node: claimed
    const { error: fmErr } = await (admin.from('family_members') as any)
      .update({
        claim_status: 'claimed',
        is_claimed: true,
        claimed_by_user_id: claimantUserId,
        claimed_at: now,
      })
      .eq('id', nodeId)
    if (fmErr) {
      return NextResponse.json({ error: 'NODE_UPDATE_FAILED', message: fmErr.message }, { status: 500 })
    }

    // 2. Upsert user_node_links
    const { error: linkErr } = await (admin.from('user_node_links') as any)
      .upsert({
        user_id: claimantUserId,
        node_id: nodeId,
        family_id: familyId,
        is_primary: true,
        linked_at: now,
      }, { onConflict: 'user_id,node_id' })
    if (linkErr) {
      // Compensating rollback: revert node back to claim_pending so retry works.
      await (admin.from('family_members') as any)
        .update({ claim_status: 'claim_pending', is_claimed: false, claimed_by_user_id: null, claimed_at: null })
        .eq('id', nodeId)
      return NextResponse.json({ error: 'LINK_FAILED', message: linkErr.message }, { status: 500 })
    }

    // 3. Update claimant's profile: set member_id (best-effort — don't fail review if this errors)
    await (admin.from('profiles') as any)
      .update({ member_id: nodeId })
      .eq('id', claimantUserId)

    // 4. Audit log (best-effort)
    await (admin.from('claim_audit_log') as any)
      .insert({
        node_id: nodeId,
        family_id: familyId,
        actor_id: user.id,
        action: 'claim_verified',
        metadata: { reviewedBy: user.id, claimantUserId, reason: reason ?? null },
      })

    // 5. FINAL COMMIT: mark claim_requests verified under optimistic lock.
    const { count: updated } = await (admin.from('claim_requests') as any)
      .update({ status: 'verified', updated_at: now })
      .eq('id', id)
      .eq('status', 'pending')
      .select('*', { count: 'exact', head: true })
    if (!updated || updated === 0) {
      // Lost the race — another reviewer already moved it. Node state already
      // reflects 'claimed', so this is benign; surface a 409 for clarity.
      return NextResponse.json({ error: 'CLAIM_ALREADY_REVIEWED' }, { status: 409 })
    }

    return NextResponse.json({ status: 'approved', nodeId })
  }

  // Reject
  const now = new Date().toISOString()

  const { count: rejUpdated } = await (admin.from('claim_requests') as any)
    .update({ status: 'rejected', updated_at: now })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*', { count: 'exact', head: true })
  if (!rejUpdated || rejUpdated === 0) {
    return NextResponse.json({ error: 'CLAIM_ALREADY_REVIEWED' }, { status: 409 })
  }

  // Reset node back to unclaimed so another attempt is possible
  await (admin.from('family_members') as any)
    .update({ claim_status: 'unclaimed' })
    .eq('id', nodeId)

  // Audit
  await (admin.from('claim_audit_log') as any)
    .insert({
      node_id: nodeId,
      family_id: familyId,
      actor_id: user.id,
      action: 'claim_rejected',
      metadata: { reviewedBy: user.id, claimantUserId, reason: reason ?? null },
    })

  return NextResponse.json({ status: 'rejected', nodeId })
}
