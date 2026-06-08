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
// Handles three actions:
//   (default)             → revoke the user's claim (admin only)
//   { action: 'archive' } → soft-delete the node (admin only; NEVER hard-deletes)
//   { action: 'restore' } → un-archive a soft-deleted node (admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { reason?: string; action?: 'archive' | 'restore' }
  try { body = await req.json() } catch { body = {} }

  const admin = adminClient()

  // Use maybeSingle so restore works even when the node is soft-deleted
  // (service-role bypasses the deleted_at IS NULL RLS predicate).
  const { data: node } = await admin
    .from('family_members')
    .select('id, claim_status, is_claimed, claimed_by_user_id, family_id')
    .eq('id', id)
    .maybeSingle()
  if (!node) return NextResponse.json({ error: 'NODE_NOT_FOUND' }, { status: 404 })

  const { data: profile } = await admin
    .from('profiles')
    .select('role, family_id')
    .eq('id', user.id)
    .single()

  const isAdmin = (profile as any)?.role === 'admin'
  const isSameFamily = (profile as any)?.family_id === (node as any).family_id

  // Route to archive/restore before the claim-specific checks below
  if (body.action === 'archive') {
    const isContributor = !isAdmin && (profile as any)?.role !== 'viewer' && isSameFamily
    if (!isAdmin && !isContributor)
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

    if (isContributor) {
      // Contributors can archive unclaimed nodes OR nodes they themselves claimed.
      // They may NOT archive a node claimed by a different user — that requires an admin.
      const nodeIsClaimed = (node as any).is_claimed === true
      const claimedByOther = nodeIsClaimed && (node as any).claimed_by_user_id !== user.id
      if (claimedByOther)
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'This profile is claimed by another member. Ask a family admin to archive it.' },
          { status: 403 }
        )
      // Perform soft-delete directly — the RPC enforces admin-only in SQL so
      // we replicate its three steps here using the service-role client.
      return handleArchiveContributor(id, user.id, (node as any).family_id, admin)
    }

    return handleArchive(id, user.id, (profile as any)?.family_id, (node as any).family_id, admin)
  }
  if (body.action === 'restore') {
    if (!isAdmin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    return handleRestore(id, user.id, admin)
  }

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

  // Handle the revoked user's profile state.
  //
  // KEY DESIGN PRINCIPLE (billion-dollar app model):
  //   A user's identity = their PRIMARY family (profiles.family_id) + their
  //   primary claimed node there (profiles.member_id). These must NEVER be
  //   affected by an admin action in a DIFFERENT family.
  //
  //   Scenario: Shubham (Meshram admin) accepted a cross-family invite into fdf.
  //   fdf admin revokes → only the fdf node is unclaimed. Shubham's Meshram
  //   account (family_id, member_id, role) must be completely untouched.
  //
  // TWO CASES:
  //   A) Revoked node is in a DIFFERENT family than user's profiles.family_id
  //      → This was a cross-family/secondary claim. Just clean up user_node_links.
  //        The user's primary profile is already correct. No profile update needed.
  //   B) Revoked node is in the SAME family as profiles.family_id
  //      → The user's primary claim was revoked. Restore their previous context
  //        from the audit log, or orphan them if no prior family exists.

  const revokedUserId = (node as any).claimed_by_user_id as string | null
  let restoredToNode: { id: string; family_id: string } | null = null

  if (revokedUserId) {
    const { data: revokedUserProfile } = await admin
      .from('profiles')
      .select('family_id, member_id, role')
      .eq('id', revokedUserId)
      .maybeSingle()

    const userPrimaryFamilyId = (revokedUserProfile as any)?.family_id as string | null
    const nodeFamilyId = (node as any).family_id as string
    const isCrossFamilyRevoke = userPrimaryFamilyId && userPrimaryFamilyId !== nodeFamilyId

    if (isCrossFamilyRevoke) {
      // Case A: This node was a cross-family secondary claim.
      // The user's primary family (Meshram) is untouched — just clean up the link.
      // No profile update needed at all.
    } else {
      // Case B: Revoked their primary family node. Restore previous state.
      const { data: otherNode } = await admin
        .from('family_members')
        .select('id, family_id')
        .eq('claimed_by_user_id', revokedUserId)
        .eq('is_claimed', true)
        .neq('id', id)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

      restoredToNode = (otherNode as any) ?? null

      if (restoredToNode) {
        // Another claimed node exists — restore to it.
        const { data: priorAudit } = await admin
          .from('claim_audit_log')
          .select('metadata')
          .eq('actor_id', revokedUserId)
          .eq('action', 'claim_completed')
          .eq('family_id', restoredToNode.family_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        const restoredRole =
          (priorAudit as any)?.metadata?.previousRole ??
          (revokedUserProfile as any)?.role ??
          'contributor'
        await admin
          .from('profiles')
          .update({ member_id: restoredToNode.id, family_id: restoredToNode.family_id, role: restoredRole } as any)
          .eq('id', revokedUserId)
      } else {
        // No other claimed node — check audit log for previous family context.
        const { data: auditRow } = await admin
          .from('claim_audit_log')
          .select('metadata')
          .eq('node_id', id)
          .eq('actor_id', revokedUserId)
          .eq('action', 'claim_completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const previousFamilyId = (auditRow as any)?.metadata?.previousFamilyId as string | null
        const previousMemberId = (auditRow as any)?.metadata?.previousMemberId as string | null
        const previousRole = (auditRow as any)?.metadata?.previousRole as string | null

        if (previousFamilyId) {
          const { data: prevFamily } = await admin
            .from('families').select('id').eq('id', previousFamilyId).maybeSingle()

          if (prevFamily) {
            let restoredMemberId: string | null = null
            if (previousMemberId) {
              const { data: prevMember } = await admin
                .from('family_members')
                .select('id, is_claimed, claimed_by_user_id, claim_status')
                .eq('id', previousMemberId)
                .eq('family_id', previousFamilyId)
                .is('deleted_at', null)
                .maybeSingle()
              const valid =
                prevMember &&
                (prevMember as any).is_claimed === true &&
                (prevMember as any).claimed_by_user_id === revokedUserId &&
                (prevMember as any).claim_status !== 'revoked'
              restoredMemberId = valid ? previousMemberId : null
            }
            await admin
              .from('profiles')
              .update({ family_id: previousFamilyId, member_id: restoredMemberId, role: previousRole ?? 'contributor' } as any)
              .eq('id', revokedUserId)
          } else {
            // Previous family was deleted — keep the user in the current family
            // so they can still see the tree and re-claim a node.
            await admin.from('profiles').update({ member_id: null } as any).eq('id', revokedUserId)
          }
        } else {
          // No previous-family audit trail. Keep the user in THIS family
          // (family_id unchanged) but clear member_id so they see the
          // 'unlinked' banner and can claim a correct node.
          // Revoking a claim ≠ removing a user from the family — that is
          // a separate admin action (admin/members/[userId]/remove).
          await admin.from('profiles').update({ member_id: null } as any).eq('id', revokedUserId)
        }
      }
    }
  }

  await admin.from('claim_audit_log').insert({
    node_id: id,
    family_id: (node as any).family_id,
    actor_id: user.id,
    action: 'claim_revoked',
    metadata: {
      reason: body.reason,
      revokedFromUserId: (node as any).claimed_by_user_id,
      restoredToNodeId: restoredToNode?.id ?? null,
      restoredToFamilyId: restoredToNode?.family_id ?? null,
    },
  })

  return NextResponse.json({ status: 'revoked', revokedAt })
}

/**
 * Soft-archive for contributors (non-admin members in the same family).
 * Replicates the archive_family_member RPC steps using the service-role client
 * because the RPC enforces admin-only at the SQL level.
 *
 * Allowed: unclaimed nodes, or nodes claimed by the contributor themselves.
 * Denied:  nodes claimed by a different user (guarded upstream in the route handler).
 */
async function handleArchiveContributor(
  nodeId: string,
  actorId: string,
  nodeFamilyId: string,
  adm: ReturnType<typeof adminClient>
): Promise<NextResponse> {
  // 1. Soft-delete (idempotent)
  const { error: updateErr } = await adm
    .from('family_members')
    .update({ deleted_at: new Date().toISOString(), deleted_by: actorId } as any)
    .eq('id', nodeId)
    .is('deleted_at', null)
  if (updateErr)
    return NextResponse.json({ error: 'ARCHIVE_FAILED', message: updateErr.message }, { status: 500 })

  // 2. Clear claimer's profile link → triggers node_deleted identity state in the UI
  await adm.from('profiles').update({ member_id: null } as any).eq('member_id', nodeId)

  // 3. Audit trail
  await (adm as any).from('claim_audit_log').insert({
    node_id: nodeId,
    family_id: nodeFamilyId,
    actor_id: actorId,
    action: 'node_archived',
    metadata: { archived_by: actorId, archived_at: new Date().toISOString(), role: 'contributor' },
  })

  return NextResponse.json({ status: 'archived', nodeId })
}

/**
 * POST /api/nodes/[id]/revoke-claim  { action: 'archive' }
 *
 * Soft-deletes a family_members node (admin only).
 * Physical DELETE is never performed — see migration 032/033 for the schema.
 *
 * What this does:
 *   • Sets deleted_at / deleted_by on the node → invisible via RLS immediately
 *   • Clears the claimer's profile.member_id → node_deleted identity state
 *   • Does NOT touch sibling parent_ids/spouse_ids → graph topology preserved
 *   • Memories (milestones/voice_notes) survive (FK = ON DELETE SET NULL)
 *   • Audit log entry written for observability
 *
 * The node can be restored by a family admin via { action: 'restore' }.
 */
async function handleArchive(
  nodeId: string,
  adminUserId: string,
  adminFamilyId: string,
  nodeFamilyId: string,
  adm: ReturnType<typeof adminClient>
): Promise<NextResponse> {
  if (adminFamilyId !== nodeFamilyId)
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const { error: rpcErr } = await (adm as any).rpc('archive_family_member', {
    p_node_id: nodeId,
    p_admin_id: adminUserId,
  })

  if (rpcErr) {
    if (rpcErr.message?.includes('PERMISSION_DENIED'))
      return NextResponse.json({ error: 'FORBIDDEN', message: rpcErr.message }, { status: 403 })
    if (rpcErr.message?.includes('NODE_NOT_FOUND'))
      return NextResponse.json({ error: 'NODE_NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ error: 'ARCHIVE_FAILED', message: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'archived', nodeId })
}

async function handleRestore(
  nodeId: string,
  adminUserId: string,
  adm: ReturnType<typeof adminClient>
): Promise<NextResponse> {
  const { error: rpcErr } = await (adm as any).rpc('restore_family_member', {
    p_node_id: nodeId,
    p_admin_id: adminUserId,
  })

  if (rpcErr) {
    if (rpcErr.message?.includes('PERMISSION_DENIED'))
      return NextResponse.json({ error: 'FORBIDDEN', message: rpcErr.message }, { status: 403 })
    return NextResponse.json({ error: 'RESTORE_FAILED', message: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'restored', nodeId })
}
