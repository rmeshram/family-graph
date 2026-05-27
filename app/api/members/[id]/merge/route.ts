/**
 * POST /api/members/[id]/merge
 *
 * Merges a duplicate node (targetId) into the primary node (id).
 *
 * Steps:
 *  1. Load both nodes — validate they belong to the same family.
 *  2. Merge scalar fields: primary wins; nulls are filled from duplicate.
 *  3. Merge array fields: union of parentIds and spouseIds (deduplicated, self-refs removed).
 *  4. Update all OTHER members that reference the duplicate ID in parentIds/spouseIds.
 *  5. Transfer user claim: if duplicate is claimed but primary is not, move the claim.
 *  6. Transfer stories (if stories table exists) from duplicate → primary.
 *  7. Delete the duplicate node.
 *  8. Return the updated primary.
 *
 * Security: caller must be authenticated and belong to the same family as both nodes.
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

// Fields that can be merged (primary wins if non-null, fills from duplicate if null)
const MERGEABLE_SCALAR_FIELDS = [
  'birth_year', 'birth_month', 'birth_day', 'death_year',
  'birth_place', 'current_place', 'photo_url', 'bio',
  'occupation', 'relationship', 'gender', 'generation',
  'gotra', 'caste', 'hometown', 'native_language', 'religion',
  'phone', 'email', 'instagram_handle', 'is_alive', 'is_deceased',
  'date_of_birth',
] as const

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: primaryId } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { targetId?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { targetId } = body
  if (!targetId) return NextResponse.json({ error: 'targetId is required' }, { status: 400 })
  if (primaryId === targetId) return NextResponse.json({ error: 'Cannot merge a node into itself' }, { status: 400 })

  // Use admin client for cross-RLS operations
  const admin = adminClient()

  // ── 1. Load both nodes ──────────────────────────────────────────────────────
  const [{ data: primary, error: pe }, { data: duplicate, error: de }] = await Promise.all([
    admin.from('family_members').select('*').eq('id', primaryId).single(),
    admin.from('family_members').select('*').eq('id', targetId).single(),
  ])

  if (pe || !primary) return NextResponse.json({ error: 'Primary node not found' }, { status: 404 })
  if (de || !duplicate) return NextResponse.json({ error: 'Duplicate node not found' }, { status: 404 })

  // Verify same family — prevent cross-family merges
  if ((primary as any).family_id !== (duplicate as any).family_id) {
    return NextResponse.json({ error: 'Cannot merge nodes from different families' }, { status: 403 })
  }

  // Verify caller belongs to this family
  const { data: profile } = await admin.from('profiles').select('family_id, role').eq('id', user.id).single()
  if (!profile || (profile as any).family_id !== (primary as any).family_id) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }
  // Only admins can perform irreversible merge operations
  if ((profile as any).role !== 'admin') {
    return NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 })
  }

  // ── 2. Merge scalar fields ──────────────────────────────────────────────────
  const merged: Record<string, unknown> = {}
  for (const field of MERGEABLE_SCALAR_FIELDS) {
    const pVal = (primary as any)[field]
    const dVal = (duplicate as any)[field]
    merged[field] = pVal !== null && pVal !== undefined ? pVal : dVal
  }

  // ── 3. Merge array fields ──────────────────────────────────────────────────
  const pParents: string[] = (primary as any).parent_ids ?? []
  const dParents: string[] = (duplicate as any).parent_ids ?? []
  const pSpouses: string[] = (primary as any).spouse_ids ?? []
  const dSpouses: string[] = (duplicate as any).spouse_ids ?? []

  const mergedParents = [...new Set([...pParents, ...dParents])].filter(id => id !== primaryId && id !== targetId)
  const mergedSpouses = [...new Set([...pSpouses, ...dSpouses])].filter(id => id !== primaryId && id !== targetId)

  // Merge tags
  const pTags: string[] = (primary as any).tags ?? []
  const dTags: string[] = (duplicate as any).tags ?? []
  const mergedTags = [...new Set([...pTags, ...dTags])]

  // ── 4. Update all OTHER members that reference the duplicate ───────────────
  const { data: affectedMembers } = await admin
    .from('family_members')
    .select('id, parent_ids, spouse_ids')
    .eq('family_id', (primary as any).family_id)
    .neq('id', primaryId)
    .neq('id', targetId)

  const refUpdates: Promise<unknown>[] = []
  for (const member of (affectedMembers ?? [])) {
    const memberAny = member as any
    const newParents: string[] = (memberAny.parent_ids ?? []).map((pid: string) =>
      pid === targetId ? primaryId : pid
    )
    const newSpouses: string[] = (memberAny.spouse_ids ?? []).map((sid: string) =>
      sid === targetId ? primaryId : sid
    )
    const parentChanged = JSON.stringify(newParents) !== JSON.stringify(memberAny.parent_ids ?? [])
    const spouseChanged = JSON.stringify(newSpouses) !== JSON.stringify(memberAny.spouse_ids ?? [])

    if (parentChanged || spouseChanged) {
      refUpdates.push(
        Promise.resolve(
          admin.from('family_members')
            .update({ parent_ids: newParents, spouse_ids: newSpouses })
            .eq('id', memberAny.id)
        ).then(() => { })
      )
    }
  }
  await Promise.all(refUpdates)

  // ── 5. Transfer claim if applicable ───────────────────────────────────────
  const dupClaimed = (duplicate as any).is_claimed === true
  const dupClaimedBy: string | null = (duplicate as any).claimed_by_user_id ?? null
  const priClaimed = (primary as any).is_claimed === true
  const priClaimedBy: string | null = (primary as any).claimed_by_user_id ?? null
  const priUnclaimed = !priClaimed

  // GUARD: Both nodes claimed by DIFFERENT users → refuse merge.
  // Silently dropping a real person's claim is identity-destructive.
  // An admin must manually revoke one claim before merging.
  if (dupClaimed && priClaimed && dupClaimedBy !== priClaimedBy) {
    // Log the blocked attempt for auditability
    await admin.from('claim_audit_log').insert({
      node_id: primaryId,
      actor_id: user.id,
      action: 'merge_blocked',
      metadata: {
        reason: 'BOTH_CLAIMED',
        primary_id: primaryId,
        duplicate_id: targetId,
        primary_claimer: priClaimedBy,
        duplicate_claimer: dupClaimedBy,
      },
    }).then(() => { })

    return NextResponse.json(
      {
        error: 'BOTH_CLAIMED',
        message: 'Both profiles are claimed by different people. Revoke one claim before merging.',
        primaryClaimer: priClaimedBy,
        duplicateClaimer: dupClaimedBy,
      },
      { status: 409 }
    )
  }

  if (dupClaimed && priUnclaimed) {
    // Duplicate is claimed, primary is not — transfer the claim to the surviving node.
    merged['is_claimed'] = true
    merged['claimed_by_user_id'] = dupClaimedBy
    merged['claim_status'] = (duplicate as any).claim_status ?? 'claimed'
    merged['claimed_at'] = (duplicate as any).claimed_at
    merged['identity_state'] = 'claimed'

    // Update the claimer's profile.member_id to point to the surviving node.
    if (dupClaimedBy) {
      await admin.from('profiles').update({ member_id: primaryId }).eq('id', dupClaimedBy)
      // Re-point the active user_node_link to the surviving primary node.
      await admin
        .from('user_node_links')
        .update({ node_id: primaryId } as any)
        .eq('node_id', targetId)
        .eq('user_id', dupClaimedBy)
        .eq('is_primary', true)
        .then(() => { })
    }

    // Audit: record claim transfer
    await admin.from('claim_audit_log').insert({
      node_id: primaryId,
      actor_id: user.id,
      action: 'claim_completed',
      metadata: {
        reason: 'merge_claim_transfer',
        absorbed_id: targetId,
        transferred_from: dupClaimedBy,
      },
    }).then(() => { })
  } else if (dupClaimed && priClaimed && dupClaimedBy === priClaimedBy) {
    // Both claimed by the SAME user (e.g. they somehow got two nodes) — merge normally,
    // keep primary claim, log the absorbed duplicate.
    await admin.from('claim_audit_log').insert({
      node_id: primaryId,
      actor_id: user.id,
      action: 'claim_abandoned',
      metadata: {
        reason: 'merge_same_user_duplicate',
        absorbed_id: targetId,
        claimer: dupClaimedBy,
      },
    }).then(() => { })
  }

  // ── 6. Transfer stories, memories, voice_notes ───────────────────────────
  await admin
    .from('stories')
    .update({ member_id: primaryId })
    .eq('member_id', targetId)
    .then(() => { }) // best-effort

  // For memories, the duplicate may appear in tagged_member_ids (an array column).
  // Replace all occurrences of targetId with primaryId across the family's memories.
  const { data: taggedMemories } = await admin
    .from('memories')
    .select('id, tagged_member_ids')
    .contains('tagged_member_ids', [targetId])
    .eq('family_id', (primary as any).family_id)

  if (taggedMemories?.length) {
    await Promise.all(
      (taggedMemories as any[]).map(mem => {
        const updatedTags = (mem.tagged_member_ids as string[]).map((mid: string) =>
          mid === targetId ? primaryId : mid
        )
        return admin.from('memories').update({ tagged_member_ids: updatedTags }).eq('id', mem.id)
      })
    )
  }

  await admin
    .from('voice_notes')
    .update({ member_id: primaryId })
    .eq('member_id', targetId)
    .then(() => { }) // best-effort

  // Transfer any pending claim_requests on the duplicate to point at the primary.
  await admin
    .from('claim_requests')
    .update({ node_id: primaryId, updated_at: new Date().toISOString() } as any)
    .eq('node_id', targetId)
    .in('status', ['pending', 'verified'])
    .then(() => { }) // best-effort

  // Soft-deactivate any user_node_links pointing to the duplicate.
  // If primary has no active link and duplicate had one, we already transferred
  // the claim above (step 5); deactivate the old link here.
  await admin
    .from('user_node_links')
    .update({ status: 'inactive' } as any)
    .eq('node_id', targetId)
    .then(() => { }) // best-effort

  // ── 7. Apply merged update to primary, then delete duplicate ───────────────
  const { error: updateErr } = await admin
    .from('family_members')
    .update({
      ...merged,
      parent_ids: mergedParents,
      spouse_ids: mergedSpouses,
      tags: mergedTags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', primaryId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { error: deleteErr } = await admin.from('family_members').delete().eq('id', targetId)
  if (deleteErr) return NextResponse.json({ error: `Merge applied but could not delete duplicate: ${deleteErr.message}` }, { status: 500 })

  // ── 8. Audit log ────────────────────────────────────────────────────────────
  await admin.from('claim_audit_log').insert({
    node_id: primaryId,
    actor_id: user.id,
    action: 'node_merged',
    metadata: { absorbed_id: targetId },
  }).then(() => { })

  // Return the updated primary
  const { data: updated } = await admin.from('family_members').select('*').eq('id', primaryId).single()
  return NextResponse.json({ merged: true, node: updated })
}
