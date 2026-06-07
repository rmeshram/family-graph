import { NextResponse } from 'next/server'
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

// Service-role client — bypasses RLS for cross-family member reads.
// The application-level check (verified family_links.status='accepted') already
// enforces the authorization boundary, so RLS bypass is safe here.
function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } }
  )
}

// GET /api/families/linked-members
// Returns all family members from families that are accepted-linked to the caller's family,
// shaped as FamilyMember (affiliated networkGroup).
export async function GET() {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .single()

  const myFamilyId = (profile as any)?.family_id as string | null
  if (!myFamilyId) return NextResponse.json({ linkedMembers: [], linkedFamilies: [] })

  // Fetch all accepted links where this family is either side
  const { data: links } = await supabase
    .from('family_links')
    .select('id, family_a_id, family_b_id, junction_member_a, junction_member_b, link_note, visibility_scope')
    .eq('status', 'accepted')
    .or(`family_a_id.eq.${myFamilyId},family_b_id.eq.${myFamilyId}`)

  if (!links || links.length === 0) {
    return NextResponse.json({ linkedMembers: [], linkedFamilies: [] })
  }

  // Collect the other family IDs + junction info
  const linkedFamilyIds: string[] = []
  const junctionByFamily: Record<string, string | null> = {}

  for (const link of links) {
    const l = link as any
    const isA = l.family_a_id === myFamilyId
    const otherFamilyId = isA ? l.family_b_id : l.family_a_id
    const junctionMemberId = isA ? l.junction_member_a : l.junction_member_b
    linkedFamilyIds.push(otherFamilyId)
    junctionByFamily[otherFamilyId] = junctionMemberId
  }

  // Fetch family names and linked members using the service-role client so that
  // RLS on family_members (which restricts reads to profiles.family_id) doesn't
  // block cross-family reads. Authorization is already enforced above via the
  // family_links.status='accepted' check on the authed client.
  const admin = adminClient()

  // Fetch family names
  const { data: familyRows } = await admin
    .from('families')
    .select('id, name')
    .in('id', linkedFamilyIds)

  const familyNameMap: Record<string, string> = {}
  for (const f of familyRows ?? []) {
    familyNameMap[(f as any).id] = (f as any).name
  }

  // Fetch all members from linked families (admin client bypasses RLS)
  const { data: memberRows } = await admin
    .from('family_members')
    .select(`
      id, family_id, name, birth_year, death_year, birth_place, current_place,
      photo_url, bio, relationship, occupation, gender, generation,
      parent_ids, spouse_ids, is_alive, side, gotra, claim_status,
      is_deceased, added_at, claimed_by_user_id
    `)
    .in('family_id', linkedFamilyIds)
    .is('deleted_at', null)
    .order('generation', { ascending: true })

  let linkedMembers = (memberRows ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    birthYear: row.birth_year ?? undefined,
    deathYear: row.death_year ?? undefined,
    birthPlace: row.birth_place ?? undefined,
    currentPlace: row.current_place ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    bio: row.bio ?? undefined,
    relationship: row.relationship ?? undefined,
    occupation: row.occupation ?? undefined,
    gender: row.gender ?? undefined,
    generation: row.generation ?? 3,
    parentIds: row.parent_ids ?? [],
    spouseIds: row.spouse_ids ?? [],
    isAlive: row.is_alive ?? true,
    side: row.side ?? undefined,
    gotra: row.gotra ?? undefined,
    claimStatus: row.claim_status ?? 'unclaimed',
    claimedByUserId: row.claimed_by_user_id ?? undefined,
    addedAt: row.added_at ?? undefined,
    // Mark as affiliated so the tree renders them as the "Community" cluster
    networkGroup: 'affiliated' as const,
    affiliatedFamilyId: row.family_id,
    affiliatedFamilyName: familyNameMap[row.family_id] ?? 'Linked Family',
    affiliatedJunctionId: junctionByFamily[row.family_id] ?? undefined,
  }))

  // ── Deduplication: bridge nodes claimed via cross-claim have is_primary=false
  // in user_node_links. The same user has an is_primary=true node in their own
  // family. Showing both creates a duplicate person in the merged graph.
  //
  // Fix: find all bridge nodes (is_primary=false) in the linked families, look
  // up each user's primary node, then:
  //   1. Remap all parentIds/spouseIds that reference the bridge node to point
  //      to the primary node (so cross-family edges like James↔Priya are drawn
  //      correctly between the canonical nodes).
  //   2. Remove the bridge node from linkedMembers so only one copy of that
  //      person appears in the merged graph.
  const allLinkedNodeIds = (memberRows ?? []).map((r: any) => r.id as string)
  if (allLinkedNodeIds.length > 0) {
    const { data: bridgeLinks } = await admin
      .from('user_node_links')
      .select('user_id, node_id')
      .in('node_id', allLinkedNodeIds)
      .eq('is_primary', false)

    if (bridgeLinks && bridgeLinks.length > 0) {
      const bridgeUserIds = (bridgeLinks as any[]).map((l) => l.user_id as string)
      // Find the primary node for each bridge user
      const { data: primaryLinks } = await admin
        .from('user_node_links')
        .select('user_id, node_id')
        .in('user_id', bridgeUserIds)
        .eq('is_primary', true)

      // substitution: bridge-node-id → primary-node-id
      const primaryByUser = new Map<string, string>(
        (primaryLinks ?? []).map((l: any) => [l.user_id as string, l.node_id as string])
      )
      const substitution = new Map<string, string>()
      for (const bl of bridgeLinks as any[]) {
        const primaryNodeId = primaryByUser.get(bl.user_id as string)
        if (primaryNodeId && primaryNodeId !== bl.node_id) {
          substitution.set(bl.node_id as string, primaryNodeId)
        }
      }

      if (substitution.size > 0) {
        const subst = (ids: string[]) => ids.map(id => substitution.get(id) ?? id)
        linkedMembers = linkedMembers
          .filter(m => !substitution.has(m.id))            // remove duplicate bridge nodes
          .map(m => ({
            ...m,
            parentIds: subst(m.parentIds),                  // remap edges to primary node
            spouseIds: subst(m.spouseIds),
          }))
      }
    }
  }

  const linkedFamilies = linkedFamilyIds.map(fid => ({
    id: fid,
    name: familyNameMap[fid] ?? 'Linked Family',
    memberCount: linkedMembers.filter(m => m.affiliatedFamilyId === fid).length,
    junctionMemberId: junctionByFamily[fid] ?? null,
  }))

  return NextResponse.json({ linkedMembers, linkedFamilies })
}
