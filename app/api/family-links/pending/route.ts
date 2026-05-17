import { NextResponse } from 'next/server'
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

// GET /api/family-links/pending
// Returns:
//   incoming — pending requests where the caller's family is family_b (needs action)
//   outgoing — requests the caller's family sent (family_a) and their current status
//   accepted — all accepted links for the Settings "Connected Families" panel
export async function GET() {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', user.id)
    .single()

  const myFamilyId = (profile as any)?.family_id as string | null
  if (!myFamilyId) return NextResponse.json({ incoming: [], outgoing: [], accepted: [] })

  // Fetch all links involving this family
  const { data: links } = await admin
    .from('family_links')
    .select('id, family_a_id, family_b_id, status, link_note, initiated_by, accepted_by, created_at, updated_at')
    .or(`family_a_id.eq.${myFamilyId},family_b_id.eq.${myFamilyId}`)
    .order('created_at', { ascending: false })

  if (!links || links.length === 0) {
    return NextResponse.json({ incoming: [], outgoing: [], accepted: [] })
  }

  // Collect all other family IDs to fetch names
  const otherFamilyIds = [...new Set(
    links.flatMap((l: any) => [l.family_a_id, l.family_b_id]).filter((id: string) => id !== myFamilyId)
  )]

  const { data: familyRows } = await admin
    .from('families')
    .select('id, name, invite_code')
    .in('id', otherFamilyIds)

  const familyMap: Record<string, { name: string; invite_code: string }> = {}
  for (const f of familyRows ?? []) {
    familyMap[(f as any).id] = { name: (f as any).name, invite_code: (f as any).invite_code }
  }

  const enrich = (l: any) => {
    const isA = l.family_a_id === myFamilyId
    const otherFamilyId = isA ? l.family_b_id : l.family_a_id
    return {
      id: l.id,
      status: l.status,
      linkNote: l.link_note,
      createdAt: l.created_at,
      updatedAt: l.updated_at,
      initiatedByMe: l.initiated_by === user.id,
      otherFamilyId,
      otherFamilyName: familyMap[otherFamilyId]?.name ?? 'Unknown Family',
    }
  }

  const incoming = links
    .filter((l: any) => l.family_b_id === myFamilyId && l.status === 'pending')
    .map(enrich)

  const outgoing = links
    .filter((l: any) => l.family_a_id === myFamilyId && l.status !== 'accepted')
    .map(enrich)

  const accepted = links
    .filter((l: any) => l.status === 'accepted')
    .map(enrich)

  return NextResponse.json({ incoming, outgoing, accepted })
}
