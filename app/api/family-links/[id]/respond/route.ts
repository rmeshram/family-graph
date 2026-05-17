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
    .select('id, family_a_id, family_b_id, status')
    .eq('id', linkId)
    .single()

  if (!link) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  if ((link as any).status !== 'pending') {
    return NextResponse.json({ error: 'NOT_PENDING' }, { status: 409 })
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

  const newStatus = action === 'accept' ? 'accepted' : 'rejected'

  const { error } = await admin
    .from('family_links')
    .update({
      status: newStatus,
      accepted_by: action === 'accept' ? user.id : null,
      junction_member_b: junctionMemberBId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', linkId)

  if (error) {
    console.error('family_links update error:', error)
    return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ linkId, status: newStatus })
}
