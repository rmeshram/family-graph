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

  // Fetch family names
  const { data: familyRows } = await supabase
    .from('families')
    .select('id, name')
    .in('id', linkedFamilyIds)

  const familyNameMap: Record<string, string> = {}
  for (const f of familyRows ?? []) {
    familyNameMap[(f as any).id] = (f as any).name
  }

  // Fetch all members from linked families
  const { data: memberRows } = await supabase
    .from('family_members')
    .select(`
      id, family_id, name, birth_year, death_year, birth_place, current_place,
      photo_url, bio, relationship, occupation, gender, generation,
      parent_ids, spouse_ids, is_alive, side, gotra, claim_status,
      is_deceased, added_at
    `)
    .in('family_id', linkedFamilyIds)
    .eq('is_deceased', false)
    .order('generation', { ascending: true })

  const linkedMembers = (memberRows ?? []).map((row: any) => ({
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
    addedAt: row.added_at ?? undefined,
    // Mark as affiliated so the tree renders them as the "Community" cluster
    networkGroup: 'affiliated' as const,
    affiliatedFamilyId: row.family_id,
    affiliatedFamilyName: familyNameMap[row.family_id] ?? 'Linked Family',
    affiliatedJunctionId: junctionByFamily[row.family_id] ?? undefined,
  }))

  const linkedFamilies = linkedFamilyIds.map(fid => ({
    id: fid,
    name: familyNameMap[fid] ?? 'Linked Family',
    memberCount: linkedMembers.filter(m => m.affiliatedFamilyId === fid).length,
    junctionMemberId: junctionByFamily[fid] ?? null,
  }))

  return NextResponse.json({ linkedMembers, linkedFamilies })
}
