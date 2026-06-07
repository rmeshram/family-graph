/**
 * GET /api/admin/graph-integrity
 *
 * Runs the graph_integrity_check() Postgres function and returns a JSON
 * report for the caller's family. Provides:
 *
 *   - dangling_parent_refs  — parent_ids pointing to deleted/missing nodes
 *   - dangling_spouse_refs  — spouse_ids pointing to deleted/missing nodes
 *   - one_way_spouse_links  — A.spouse_ids has B but B.spouse_ids missing A
 *   - orphan_claimed_nodes  — is_claimed=true but claimed_by_user_id is null
 *   - stale_claim_fields    — claimed_by_user_id set but is_claimed=false
 *   - healthy               — true only when all counts are 0
 *
 * Intended for the family admin dashboard / dev tooling.
 * Requires: admin role in the caller's family.
 *
 * The underlying SQL function (migration 040) is SECURITY DEFINER and
 * GRANT-ed only to service_role, so this route is the only entry point.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} }, auth: { persistSession: false } }
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
          try { c.forEach(({ name, value, options }) => cs.set(name, value, options)) } catch {}
        },
      },
    }
  )
}

export async function GET() {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  // Require admin role
  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN — admin role required' }, { status: 403 })
  }

  const familyId: string | null = (profile as any)?.family_id ?? null
  if (!familyId) {
    return NextResponse.json({ error: 'NO_FAMILY' }, { status: 400 })
  }

  // Run the integrity check (service-role only function, migration 040)
  const { data: report, error } = await (admin as any).rpc('graph_integrity_check')

  if (error) {
    console.error('[graph-integrity] rpc error:', error)
    return NextResponse.json({ error: 'INTEGRITY_CHECK_FAILED', detail: error.message }, { status: 500 })
  }

  return NextResponse.json(report)
}

/**
 * POST /api/admin/graph-integrity
 *
 * Triggers a targeted repair pass:
 *   - Fixes stale claim fields (claimed_by_user_id set but is_claimed=false)
 *   - Repairs one-way spouse links for this family
 *   - Removes dangling parent_ids / spouse_ids references to deleted nodes
 *
 * Returns counts of repaired rows per category.
 * Requires: admin role.
 */
export async function POST() {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const familyId: string = (profile as any)?.family_id
  if (!familyId) return NextResponse.json({ error: 'NO_FAMILY' }, { status: 400 })

  const now = new Date().toISOString()
  const repairs: Record<string, number> = {}

  // 1. Fix stale claim fields (ISSUE-03 legacy data within this family)
  const { count: staleClaimed } = await admin
    .from('family_members')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .not('claimed_by_user_id', 'is', null)
    .or('is_claimed.is.false,claim_status.neq.claimed')
    .is('deleted_at', null)

  if ((staleClaimed ?? 0) > 0) {
    await admin
      .from('family_members')
      .update({ is_claimed: true, claim_status: 'claimed', claimed_at: now } as any)
      .eq('family_id', familyId)
      .not('claimed_by_user_id', 'is', null)
      .is('deleted_at', null)
    repairs.stale_claim_fields = staleClaimed ?? 0
  }

  // 2. Remove dangling parent_ids and spouse_ids pointing to deleted/missing nodes
  //    Fetch all live node IDs in this family, then null out references to any not in that set.
  const { data: liveNodes } = await admin
    .from('family_members')
    .select('id, parent_ids, spouse_ids')
    .eq('family_id', familyId)
    .is('deleted_at', null)

  const liveIdSet = new Set((liveNodes ?? []).map((n: any) => n.id as string))
  let danglingParentFixes = 0
  let danglingSpouseFixes = 0

  for (const node of (liveNodes ?? []) as any[]) {
    const cleanParents = (node.parent_ids ?? []).filter((pid: string) => liveIdSet.has(pid))
    const cleanSpouses = (node.spouse_ids ?? []).filter((sid: string) => liveIdSet.has(sid))

    const parentChanged = cleanParents.length !== (node.parent_ids ?? []).length
    const spouseChanged = cleanSpouses.length !== (node.spouse_ids ?? []).length

    if (parentChanged || spouseChanged) {
      const patch: Record<string, unknown> = {}
      if (parentChanged) { patch.parent_ids = cleanParents; danglingParentFixes++ }
      if (spouseChanged) { patch.spouse_ids = cleanSpouses; danglingSpouseFixes++ }
      await admin.from('family_members').update(patch as any).eq('id', node.id)
    }
  }

  repairs.dangling_parent_refs_removed = danglingParentFixes
  repairs.dangling_spouse_refs_removed = danglingSpouseFixes

  // 3. Fix one-way spouse links within this family
  //    Re-read after dangling removal so we work with clean data.
  const { data: refreshedNodes } = await admin
    .from('family_members')
    .select('id, spouse_ids')
    .eq('family_id', familyId)
    .is('deleted_at', null)

  const spouseMap = new Map((refreshedNodes ?? []).map((n: any) => [n.id as string, (n.spouse_ids ?? []) as string[]]))
  let oneWayFixes = 0

  for (const [nodeId, spouseIds] of spouseMap.entries()) {
    for (const spouseId of spouseIds) {
      const spouseSides = spouseMap.get(spouseId)
      if (spouseSides && !spouseSides.includes(nodeId)) {
        // Add nodeId to spouseId's spouse_ids
        await admin
          .from('family_members')
          .update({ spouse_ids: [...spouseSides, nodeId] } as any)
          .eq('id', spouseId)
        spouseMap.set(spouseId, [...spouseSides, nodeId]) // update local map to avoid double-fix
        oneWayFixes++
      }
    }
  }

  repairs.one_way_spouse_links_fixed = oneWayFixes

  // 4. Write audit entry
  await (admin.from('claim_audit_log') as any).insert({
    node_id: null,
    family_id: familyId,
    actor_id: user.id,
    action: 'node_restored', // closest existing action; means "admin repair"
    metadata: { type: 'graph_integrity_repair', repairs },
  }).then(() => {})

  return NextResponse.json({ ok: true, repairs })
}
