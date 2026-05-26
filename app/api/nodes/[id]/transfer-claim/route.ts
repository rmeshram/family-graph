/**
 * POST /api/nodes/[id]/transfer-claim
 *
 * Transfers a user's claimed node from their current node to a new node.
 * Used when a user was incorrectly linked to the wrong family member node.
 *
 * Body: { fromNodeId: string, toNodeId: string, reason?: string }
 *
 * Security:
 *   - Caller must be the owner of fromNodeId OR an admin/moderator of the family
 *   - Both nodes must belong to the same family
 *   - toNodeId must be unclaimed
 *   - Full audit trail written to claim_audit_log
 *
 * Actions:
 *   1. Detach user from fromNodeId (unclaim it)
 *   2. Claim toNodeId for user (update family_members + profiles + user_node_links)
 *   3. Write claim_audit_log 'claim_transferred' event
 */

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // `id` in the route is the fromNodeId (the node being detached)
  const { id: fromNodeId } = await params

  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { toNodeId?: string; reason?: string }
  try { body = await req.json() } catch { body = {} }

  const { toNodeId, reason } = body
  if (!toNodeId || typeof toNodeId !== 'string') {
    return NextResponse.json({ error: 'toNodeId is required' }, { status: 400 })
  }
  if (fromNodeId === toNodeId) {
    return NextResponse.json({ error: 'fromNodeId and toNodeId must be different' }, { status: 400 })
  }

  const admin = adminClient()

  // Load caller's profile
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, family_id, member_id')
    .eq('id', user.id)
    .single()
  const callerRole: string = (callerProfile as any)?.role ?? 'viewer'
  const callerFamilyId: string | null = (callerProfile as any)?.family_id ?? null

  // Load both nodes
  const [{ data: fromNode }, { data: toNode }] = await Promise.all([
    admin.from('family_members')
      .select('id, family_id, is_claimed, claimed_by_user_id, claim_status, name')
      .eq('id', fromNodeId)
      .single(),
    admin.from('family_members')
      .select('id, family_id, is_claimed, claimed_by_user_id, claim_status, name')
      .eq('id', toNodeId)
      .single(),
  ])

  if (!fromNode) return NextResponse.json({ error: 'FROM_NODE_NOT_FOUND' }, { status: 404 })
  if (!toNode) return NextResponse.json({ error: 'TO_NODE_NOT_FOUND' }, { status: 404 })

  // Both nodes must be in the same family
  if ((fromNode as any).family_id !== (toNode as any).family_id) {
    return NextResponse.json(
      { error: 'CROSS_FAMILY_TRANSFER_FORBIDDEN', message: 'Both nodes must belong to the same family.' },
      { status: 403 }
    )
  }
  const familyId: string = (fromNode as any).family_id

  // Permission check: caller must be the current owner OR admin/moderator of the family
  const isOwner = (fromNode as any).claimed_by_user_id === user.id
  const isPrivileged = callerFamilyId === familyId && ['admin', 'moderator'].includes(callerRole)
  if (!isOwner && !isPrivileged) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Only the node owner or a family admin/moderator can transfer a claim.' },
      { status: 403 }
    )
  }

  // fromNode must currently be claimed (otherwise nothing to transfer)
  if (!(fromNode as any).is_claimed) {
    return NextResponse.json(
      { error: 'FROM_NODE_NOT_CLAIMED', message: 'The source node is not currently claimed.' },
      { status: 409 }
    )
  }

  // toNode must be unclaimed
  if ((toNode as any).is_claimed) {
    return NextResponse.json(
      { error: 'TO_NODE_ALREADY_CLAIMED', message: 'The target node is already claimed by someone else.' },
      { status: 409 }
    )
  }

  // Determine which userId is being transferred (owner of fromNodeId)
  const targetUserId: string = (fromNode as any).claimed_by_user_id as string

  const now = new Date().toISOString()

  // ── Write operations (fail-safe: do not partially commit) ──────────────────

  // 1. Detach fromNode
  const { error: detachErr } = await (admin.from('family_members') as any).update({
    is_claimed: false,
    claimed_by_user_id: null,
    claim_status: 'unclaimed',
    claimed_at: null,
  }).eq('id', fromNodeId)
  if (detachErr) return NextResponse.json({ error: 'DETACH_FAILED', detail: detachErr.message }, { status: 500 })

  // 2. Claim toNode
  const { error: claimErr } = await (admin.from('family_members') as any).update({
    is_claimed: true,
    claimed_by_user_id: targetUserId,
    claim_status: 'claimed',
    claimed_at: now,
  }).eq('id', toNodeId).eq('is_claimed', false)
  if (claimErr) {
    // Roll back the detach to avoid leaving the system in a split state
    await (admin.from('family_members') as any).update({
      is_claimed: true,
      claimed_by_user_id: targetUserId,
      claim_status: 'claimed',
    }).eq('id', fromNodeId)
    return NextResponse.json({ error: 'CLAIM_FAILED', detail: claimErr.message }, { status: 500 })
  }

  // 3. Update user_node_links: deactivate old link, upsert new one
  await (admin.from('user_node_links') as any)
    .update({ status: 'inactive', is_primary: false })
    .eq('user_id', targetUserId)
    .eq('node_id', fromNodeId)
    .eq('family_id', familyId)

  await (admin.from('user_node_links') as any).upsert({
    user_id: targetUserId,
    node_id: toNodeId,
    family_id: familyId,
    is_primary: true,
    status: 'active',
  }, { onConflict: 'user_id,node_id,family_id' })

  // 4. Update profiles.member_id
  await admin.from('profiles').update({ member_id: toNodeId }).eq('id', targetUserId)

  // 5. Audit log
  await (admin.from('claim_audit_log') as any).insert({
    node_id: toNodeId,
    family_id: familyId,
    actor_id: user.id,
    action: 'claim_transferred',
    metadata: {
      from_node_id: fromNodeId,
      from_node_name: (fromNode as any).name,
      to_node_name: (toNode as any).name,
      transferred_user_id: targetUserId,
      reason: reason ?? null,
      performed_by_role: callerRole,
    },
  })

  return NextResponse.json({
    success: true,
    fromNodeId,
    toNodeId,
    transferredUserId: targetUserId,
  })
}
