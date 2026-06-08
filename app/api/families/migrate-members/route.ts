import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

// Service-role client — bypasses RLS for cross-family member moves.
// Authorization is enforced at the application level below (caller must own fromFamilyId).
function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } }
  )
}

/**
 * POST /api/families/migrate-members
 *
 * Moves all family_members rows from `fromFamilyId` to `toFamilyId`.
 * Uses the service-role key to bypass RLS — the client-side Supabase cannot
 * UPDATE family_id to a different family due to the WITH CHECK constraint.
 *
 * Optionally merges two "same person" nodes that exist after migration:
 * - `oldNodeId`  — the node that already existed in fromFamily (will be deleted)
 * - `newNodeId`  — the node in toFamily that was claimed (will absorb old node's edges)
 *
 * Authorization: caller must be authenticated and currently belong to
 * fromFamilyId OR toFamilyId (handles both "before" and "after" profile update).
 */
export async function POST(req: NextRequest) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { fromFamilyId, toFamilyId, oldNodeId, newNodeId } = body as {
    fromFamilyId: string
    toFamilyId: string
    oldNodeId?: string // optional: old Rahul node (in fromFamily, to be merged+deleted)
    newNodeId?: string // optional: new Rahul node (in toFamily, will absorb old edges)
  }

  if (!fromFamilyId || !toFamilyId) {
    return NextResponse.json({ error: 'fromFamilyId and toFamilyId are required' }, { status: 400 })
  }
  if (fromFamilyId === toFamilyId) {
    return NextResponse.json({ success: true, migrated: 0 }) // nothing to do
  }

  const admin = adminClient()

  // Authorization: caller must belong to one of the two families OR have a
  // claimed node in fromFamilyId. We use the ADMIN client here to bypass any
  // RLS policies on the profiles table that could return null for the caller's
  // own row (causing a false 403). We check three evidence paths:
  //   1. profile.family_id matches either family (most common case)
  //   2. caller has a claimed node in fromFamilyId (join-time case, before profile update)
  //   3. caller has a claimed node in toFamilyId (after-profile-update case)
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .single()

  const callerFamilyId = (callerProfile as any)?.family_id as string | null

  if (callerFamilyId !== fromFamilyId && callerFamilyId !== toFamilyId) {
    // Secondary check: does the user have any claimed node in either family?
    const { data: claimedInFrom } = await admin
      .from('family_members')
      .select('id')
      .eq('claimed_by_user_id', user.id)
      .in('family_id', [fromFamilyId, toFamilyId])
      .limit(1)

    if (!claimedInFrom || (claimedInFrom as any[]).length === 0) {
      console.warn(`[migrate-members] 403: user ${user.id} callerFamily=${callerFamilyId} from=${fromFamilyId} to=${toFamilyId}`)
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 403 })
    }
  }

  // ── 1. Move all members from fromFamily → toFamily ────────────────────────
  const { data: movedRows, error: moveErr } = await admin
    .from('family_members')
    .update({ family_id: toFamilyId })
    .eq('family_id', fromFamilyId)
    .select('id')

  if (moveErr) {
    console.error('[migrate-members] move failed:', moveErr.message)
    return NextResponse.json({ error: moveErr.message }, { status: 500 })
  }

  const migrated = (movedRows ?? []).length

  // ── 2. Node merge: absorb oldNode's edges into newNode, then delete oldNode ─
  // This handles the case where both families had a node for the same person
  // (e.g., Rahul existed in both trees). After physical migration there would be
  // two Rahul nodes in toFamily. We merge them here.
  if (oldNodeId && newNodeId && oldNodeId !== newNodeId) {
    // Fetch the old node's structural data
    const { data: oldNode } = await admin
      .from('family_members')
      .select('parent_ids, spouse_ids, generation')
      .eq('id', oldNodeId)
      .single()

    const { data: newNode } = await admin
      .from('family_members')
      .select('parent_ids, spouse_ids, generation')
      .eq('id', newNodeId)
      .single()

    if (oldNode && newNode) {
      const oldParents = ((oldNode as any).parent_ids ?? []) as string[]
      const oldSpouses = ((oldNode as any).spouse_ids ?? []) as string[]
      const newParents = ((newNode as any).parent_ids ?? []) as string[]
      const newSpouses = ((newNode as any).spouse_ids ?? []) as string[]

      // Merged edges (deduplicated, excluding self-references)
      const mergedParents = [...new Set([...newParents, ...oldParents])].filter(id => id !== newNodeId && id !== oldNodeId)
      const mergedSpouses = [...new Set([...newSpouses, ...oldSpouses])].filter(id => id !== newNodeId && id !== oldNodeId)
      // Use oldNode's generation if newNode has none (0 is valid, so check explicitly)
      const generation = (newNode as any).generation ?? (oldNode as any).generation

      // Update newNode with merged edges
      await admin
        .from('family_members')
        .update({
          parent_ids: mergedParents,
          spouse_ids: mergedSpouses,
          generation,
        })
        .eq('id', newNodeId)

      // Remap: any member that referenced oldNodeId as parent/spouse → now references newNodeId
      const { data: affectedMembers } = await admin
        .from('family_members')
        .select('id, parent_ids, spouse_ids')
        .eq('family_id', toFamilyId)
        .neq('id', oldNodeId)
        .neq('id', newNodeId)

      for (const m of (affectedMembers ?? []) as any[]) {
        const pids: string[] = m.parent_ids ?? []
        const sids: string[] = m.spouse_ids ?? []
        const newPids = pids.map((id: string) => id === oldNodeId ? newNodeId : id)
        const newSids = sids.map((id: string) => id === oldNodeId ? newNodeId : id)
        if (
          newPids.some((id: string, i: number) => id !== pids[i]) ||
          newSids.some((id: string, i: number) => id !== sids[i])
        ) {
          await admin
            .from('family_members')
            .update({ parent_ids: newPids, spouse_ids: newSids })
            .eq('id', m.id)
        }
      }

      // Delete the old duplicate node
      await admin
        .from('family_members')
        .delete()
        .eq('id', oldNodeId)

      // Update any profile that still points to oldNodeId → newNodeId
      await admin
        .from('profiles')
        .update({ member_id: newNodeId })
        .eq('member_id', oldNodeId)
    }
  }

  return NextResponse.json({ success: true, migrated })
}
