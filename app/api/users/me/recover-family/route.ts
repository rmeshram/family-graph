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

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } }
  )
}

type AdminClient = ReturnType<typeof adminClient>

/** Normalise a display name for duplicate detection: lowercase + collapse spaces. */
function normName(s: string | null | undefined) {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Merge `deleteId` into `keepId` (same or different family, service-role client).
 * - Unions parent_ids / spouse_ids (self-refs removed, deduplicated)
 * - Remaps all other members' references from deleteId → keepId
 * - Transfers the claim if deleteId is claimed and keepId is not
 * - Transfers stories / memories
 * - Deletes deleteId
 */
async function mergeNodes(admin: AdminClient, keepId: string, deleteId: string) {
  if (keepId === deleteId) return

  const [{ data: keep }, { data: del }] = await Promise.all([
    admin.from('family_members').select('*').eq('id', keepId).single(),
    admin.from('family_members').select('*').eq('id', deleteId).single(),
  ])
  if (!keep || !del) return

  const kParents: string[] = (keep as any).parent_ids ?? []
  const dParents: string[] = (del as any).parent_ids ?? []
  const kSpouses: string[] = (keep as any).spouse_ids ?? []
  const dSpouses: string[] = (del as any).spouse_ids ?? []
  const mergedParents = [...new Set([...kParents, ...dParents])].filter(id => id !== keepId && id !== deleteId)
  const mergedSpouses = [...new Set([...kSpouses, ...dSpouses])].filter(id => id !== keepId && id !== deleteId)

  const SCALAR = ['birth_year', 'birth_place', 'photo_url', 'bio', 'occupation', 'gender',
    'generation', 'gotra', 'phone', 'email', 'is_alive', 'is_deceased', 'date_of_birth'] as const
  const scalarFills: Record<string, unknown> = {}
  for (const f of SCALAR) {
    const kv = (keep as any)[f]
    const dv = (del as any)[f]
    if ((kv === null || kv === undefined) && dv !== null && dv !== undefined) scalarFills[f] = dv
  }

  await admin.from('family_members').update({
    parent_ids: mergedParents,
    spouse_ids: mergedSpouses,
    ...scalarFills,
  }).eq('id', keepId)

  // Remap all references from the same family as `keep`
  const { data: others } = await admin
    .from('family_members')
    .select('id, parent_ids, spouse_ids')
    .eq('family_id', (keep as any).family_id)
    .neq('id', keepId)
    .neq('id', deleteId)

  for (const m of (others ?? []) as any[]) {
    const newP = (m.parent_ids ?? []).map((id: string) => id === deleteId ? keepId : id)
    const newS = (m.spouse_ids ?? []).map((id: string) => id === deleteId ? keepId : id)
    if (JSON.stringify(newP) !== JSON.stringify(m.parent_ids ?? []) ||
        JSON.stringify(newS) !== JSON.stringify(m.spouse_ids ?? [])) {
      await admin.from('family_members').update({ parent_ids: newP, spouse_ids: newS }).eq('id', m.id)
    }
  }

  // Transfer claim if del is claimed and keep is not (or same person claimed both)
  const delClaimed = (del as any).is_claimed === true
  const keepClaimed = (keep as any).is_claimed === true
  const delClaimedBy: string | null = (del as any).claimed_by_user_id ?? null
  const keepClaimedBy: string | null = (keep as any).claimed_by_user_id ?? null

  if (delClaimed && delClaimedBy) {
    if (!keepClaimed) {
      await admin.from('family_members').update({
        is_claimed: true,
        claimed_by_user_id: delClaimedBy,
        claim_status: (del as any).claim_status ?? 'claimed',
        claimed_at: (del as any).claimed_at,
      }).eq('id', keepId)
    }
    // Update profile member_id for the claimer(s)
    await admin.from('profiles').update({ member_id: keepId }).eq('id', delClaimedBy)
    if (keepClaimedBy && keepClaimedBy !== delClaimedBy) {
      await admin.from('profiles').update({ member_id: keepId }).eq('id', keepClaimedBy)
    }
  }

  // Transfer stories / memories (best-effort)
  await Promise.allSettled([
    admin.from('stories').update({ member_id: keepId } as any).eq('member_id', deleteId),
    admin.from('memories').update({ member_id: keepId } as any).eq('member_id', deleteId),
  ])

  await admin.from('family_members').delete().eq('id', deleteId)
}

/**
 * POST /api/users/me/recover-family
 *
 * Two-phase idempotent recovery. Safe to call repeatedly.
 *
 * Phase 1 — Dedup: find same-name duplicates already in currentFamily and merge
 *   them. This cleans up the "all nodes duplicated" state left by previous buggy
 *   migration runs that moved members without checking for name collisions.
 *
 * Phase 2 — Migrate: for each orphaned family (detected via claimed-node or
 *   created_by signals), move members into currentFamily. Before moving each
 *   node, check if a same-name node already exists. If yes: merge edges and
 *   delete the orphan (no duplicate). If no: update family_id.
 */
export async function POST(req: NextRequest) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, member_id')
    .eq('id', user.id)
    .single()

  const currentFamilyId = (profile as any)?.family_id as string | null
  if (!currentFamilyId) {
    return NextResponse.json({ error: 'User has no family', recovered: 0 })
  }

  // ── Phase 1: Dedup existing members in currentFamily ──────────────────────
  // Multiple migration runs may have left duplicate-named nodes in the family.
  // Group by normalized name; for each group of >1, keep the best (claimed or
  // most-edges) and merge all others into it.
  const { data: allCurrent } = await admin
    .from('family_members')
    .select('id, name, parent_ids, spouse_ids, is_claimed, claimed_by_user_id')
    .eq('family_id', currentFamilyId)

  let deduped = 0
  if (allCurrent && (allCurrent as any[]).length > 0) {
    const byName: Record<string, any[]> = {}
    for (const m of allCurrent as any[]) {
      const key = normName(m.name)
      if (!key) continue
      if (!byName[key]) byName[key] = []
      byName[key].push(m)
    }

    for (const [, group] of Object.entries(byName)) {
      if (group.length < 2) continue
      // Prefer: claimed node first, then most edges
      group.sort((a, b) => {
        if (a.is_claimed && !b.is_claimed) return -1
        if (!a.is_claimed && b.is_claimed) return 1
        const ae = (a.parent_ids?.length ?? 0) + (a.spouse_ids?.length ?? 0)
        const be = (b.parent_ids?.length ?? 0) + (b.spouse_ids?.length ?? 0)
        return be - ae
      })
      const primary = group[0]
      for (const dup of group.slice(1)) {
        console.log(`[recover-family] dedup: merging "${dup.name}" (${dup.id}) into (${primary.id})`)
        await mergeNodes(admin, primary.id, dup.id)
        deduped++
      }
    }
  }

  // ── Phase 2: Find and migrate orphaned family members ─────────────────────
  // Signal A — user has a claimed node in a different family
  // Signal B — user created a family that is not their current family
  const [{ data: claimedOrphans }, { data: createdFamilies }] = await Promise.all([
    admin.from('family_members').select('family_id')
      .eq('claimed_by_user_id', user.id)
      .neq('family_id', currentFamilyId),
    admin.from('families').select('id')
      .eq('created_by', user.id)
      .neq('id', currentFamilyId),
  ])

  const orphanedFamilyIds = [
    ...new Set([
      ...((claimedOrphans ?? []) as any[]).map((r: any) => r.family_id as string),
      ...((createdFamilies ?? []) as any[]).map((r: any) => r.id as string),
    ])
  ].filter(id => id && id !== currentFamilyId)

  if (orphanedFamilyIds.length === 0) {
    return NextResponse.json({ recovered: 0, deduped, message: deduped > 0 ? 'Deduplicated' : 'Nothing to recover' })
  }

  // Re-load current family after Phase 1 so collision checks are fresh
  const { data: freshCurrent } = await admin
    .from('family_members')
    .select('id, name')
    .eq('family_id', currentFamilyId)

  // name → id map for collision detection
  const currentByName: Record<string, string> = {}
  for (const m of (freshCurrent ?? []) as any[]) {
    const key = normName(m.name)
    if (key) currentByName[key] = m.id
  }

  let totalMoved = 0   // nodes that didn't exist → just moved (family_id updated)
  let totalMerged = 0  // nodes that already existed → merged edges, deleted orphan

  for (const orphanedFamilyId of orphanedFamilyIds) {
    const { data: orphanedMembers } = await admin
      .from('family_members')
      .select('id, name')
      .eq('family_id', orphanedFamilyId)

    for (const orphan of (orphanedMembers ?? []) as any[]) {
      const key = normName(orphan.name)
      const existingId = key ? currentByName[key] : null

      if (existingId) {
        // Collision: same-name already exists in currentFamily — merge, don't duplicate
        console.log(`[recover-family] merge-in: "${orphan.name}" (${orphan.id}) → existing (${existingId})`)
        await mergeNodes(admin, existingId, orphan.id)
        totalMerged++
      } else {
        // No collision — move the orphaned node into currentFamily
        await admin.from('family_members').update({ family_id: currentFamilyId }).eq('id', orphan.id)
        if (key) currentByName[key] = orphan.id
        totalMoved++
        console.log(`[recover-family] moved: "${orphan.name}" (${orphan.id}) → ${currentFamilyId}`)
      }
    }

    // Fix other users in the orphaned family
    await admin.from('profiles')
      .update({ family_id: currentFamilyId })
      .eq('family_id', orphanedFamilyId)
      .neq('id', user.id)
  }

  return NextResponse.json({
    recovered: totalMoved + totalMerged,
    moved: totalMoved,
    mergedIn: totalMerged,
    deduped,
    orphanedFamilies: orphanedFamilyIds.length,
  })
}
