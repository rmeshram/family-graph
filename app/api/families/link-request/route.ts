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

// POST /api/families/link-request
// Body: { targetInviteCode: string, linkNote?: string, junctionMemberAId?: string }
// Sends a family link request to the family with the given invite_code.
export async function POST(req: Request) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const body = await req.json()
  const { targetInviteCode, linkNote, junctionMemberAId } = body as {
    targetInviteCode: string
    linkNote?: string
    junctionMemberAId?: string
  }

  if (!targetInviteCode?.trim()) {
    return NextResponse.json({ error: 'MISSING_CODE' }, { status: 400 })
  }
  if (!/^[A-Z0-9]{4,16}$/.test(targetInviteCode.trim().toUpperCase())) {
    return NextResponse.json({ error: 'INVALID_CODE' }, { status: 400 })
  }

  const admin = adminClient()

  // Get caller's family
  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.family_id) {
    return NextResponse.json({ error: 'NO_FAMILY' }, { status: 400 })
  }
  if ((profile as any).role !== 'admin') {
    return NextResponse.json({ error: 'NOT_ADMIN' }, { status: 403 })
  }

  const myFamilyId = (profile as any).family_id as string

  // BUG FIX #FL1: Validate junction member belongs to caller's family
  if (junctionMemberAId) {
    const { data: memberA } = await admin
      .from('family_members')
      .select('id, family_id, name')
      .eq('id', junctionMemberAId)
      .single()
    
    if (!memberA) {
      return NextResponse.json(
        { error: 'JUNCTION_MEMBER_NOT_FOUND', message: 'The specified junction member does not exist.' },
        { status: 404 }
      )
    }
    
    if ((memberA as any).family_id !== myFamilyId) {
      return NextResponse.json(
        { error: 'INVALID_JUNCTION_MEMBER', message: 'Junction member must belong to your family.' },
        { status: 400 }
      )
    }
  }

  // Resolve target family by invite code
  const { data: targetFamily } = await admin
    .from('families')
    .select('id, name')
    .eq('invite_code', targetInviteCode.trim().toUpperCase())
    .single()

  if (!targetFamily) {
    return NextResponse.json({ error: 'FAMILY_NOT_FOUND' }, { status: 404 })
  }

  if (targetFamily.id === myFamilyId) {
    return NextResponse.json({ error: 'CANNOT_LINK_SELF' }, { status: 400 })
  }

  // Check if link already exists
  const { data: existing } = await admin
    .from('family_links')
    .select('id, status')
    .or(`and(family_a_id.eq.${myFamilyId},family_b_id.eq.${targetFamily.id}),and(family_a_id.eq.${targetFamily.id},family_b_id.eq.${myFamilyId})`)
    .maybeSingle()

  if (existing) {
    if ((existing as any).status === 'accepted') {
      return NextResponse.json({ error: 'ALREADY_LINKED' }, { status: 409 })
    }
    if ((existing as any).status === 'pending') {
      return NextResponse.json({ error: 'REQUEST_PENDING' }, { status: 409 })
    }
    // Revoked/rejected — allow re-request by deleting old entry
    await admin.from('family_links').delete().eq('id', (existing as any).id)
  }

  // Create the link request — normalise order so family_a_id < family_b_id
  const [aId, bId] = myFamilyId < targetFamily.id
    ? [myFamilyId, targetFamily.id]
    : [targetFamily.id, myFamilyId]

  const { data: link, error } = await admin
    .from('family_links')
    .insert({
      family_a_id: aId,
      family_b_id: bId,
      status: 'pending',
      initiated_by: user.id,
      link_note: linkNote ?? null,
      junction_member_a: junctionMemberAId ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('family_links insert error:', error)
    return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })
  }

  return NextResponse.json({
    linkId: (link as any).id,
    targetFamilyName: targetFamily.name,
    status: 'pending',
  })
}
