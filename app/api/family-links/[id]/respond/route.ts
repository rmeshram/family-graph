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

// POST /api/family-links/[id]/respond
// Body: { action: 'accept' | 'reject', junctionMemberBId?: string }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: linkId } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const body = await req.json()
  const { action, junctionMemberBId } = body as {
    action: 'accept' | 'reject'
    junctionMemberBId?: string
  }

  if (!['accept', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 })
  }

  const admin = adminClient()

  // Verify the link exists and caller is in family_b (the receiving family)
  const { data: link } = await admin
    .from('family_links')
    .select('id, family_a_id, family_b_id, status, initiated_by')
    .eq('id', linkId)
    .single()

  if (!link) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  if ((link as any).status !== 'pending') {
    return NextResponse.json({ error: 'NOT_PENDING' }, { status: 409 })
  }

  // ISSUE-12: prevent the original initiator from accepting their own request.
  // After UUID normalization the initiator's family may end up as family_b,
  // giving them the opportunity to act as the responder. Explicitly block this.
  if (action === 'accept' && (link as any).initiated_by === user.id) {
    return NextResponse.json({
      error: 'CANNOT_ACCEPT_OWN_REQUEST',
      message: 'You cannot accept a connection request that you initiated.',
    }, { status: 403 })
  }

  // Caller must be admin of family_b
  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.family_id !== (link as any).family_b_id) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }
  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'NOT_ADMIN' }, { status: 403 })
  }

  // BUG FIX #FL1: Validate junction member B belongs to responding family
  if (action === 'accept' && junctionMemberBId) {
    const { data: memberB } = await admin
      .from('family_members')
      .select('id, family_id, name')
      .eq('id', junctionMemberBId)
      .single()

    if (!memberB) {
      return NextResponse.json(
        { error: 'JUNCTION_MEMBER_NOT_FOUND', message: 'The specified junction member does not exist.' },
        { status: 404 }
      )
    }

    if ((memberB as any).family_id !== (link as any).family_b_id) {
      return NextResponse.json(
        { error: 'INVALID_JUNCTION_MEMBER', message: 'Junction member must belong to your family.' },
        { status: 400 }
      )
    }
  }

  const newStatus = action === 'accept' ? 'accepted' : 'rejected'

  const { data: updated, error } = await admin
    .from('family_links')
    .update({
      status: newStatus,
      accepted_by: action === 'accept' ? user.id : null,
      junction_member_b: junctionMemberBId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', linkId)
    .eq('status', 'pending')
    .select('id')

  if (error) {
    console.error('family_links update error:', error)
    return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })
  }

  // If 0 rows updated the link was already processed by a concurrent request
  if (!updated?.length) {
    return NextResponse.json({ error: 'ALREADY_PROCESSED' }, { status: 409 })
  }

  // NOTIFICATION FIX: Notify requester family of response
  const recipientFamilyId = (link as any).family_a_id // Notify the family that requested
  await admin.from('family_link_notifications').insert({
    link_id: linkId,
    event_type: action === 'accept' ? 'link_accepted' : 'link_rejected',
    recipient_family_id: recipientFamilyId,
    created_at: new Date().toISOString()
  } as any)

  return NextResponse.json({ linkId, status: newStatus })
}
