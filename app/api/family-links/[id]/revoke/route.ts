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

// POST /api/family-links/[id]/revoke
// Either side admin can revoke an accepted (or pending) link.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  // Verify caller is admin of one of the linked families
  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', user.id)
    .single()

  const myFamilyId = (profile as any)?.family_id as string | null
  if (!myFamilyId) return NextResponse.json({ error: 'NO_FAMILY' }, { status: 400 })

  const { data: link } = await admin
    .from('family_links')
    .select('id, family_a_id, family_b_id, status, initiated_by')
    .eq('id', id)
    .single()

  if (!link) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const l = link as any
  if (l.family_a_id !== myFamilyId && l.family_b_id !== myFamilyId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  // Allow: family admin OR the original initiator of the link (even if a regular member).
  // Rationale: the person who connected two trees should always be able to undo that action.
  const isAdmin = (profile as any)?.role === 'admin'
  const isInitiator = l.initiated_by === user.id
  if (!isAdmin && !isInitiator) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Only a family admin or the person who created this connection can remove it.' }, { status: 403 })
  }

  if (l.status === 'revoked') {
    return NextResponse.json({ error: 'ALREADY_REVOKED' }, { status: 409 })
  }

  const { error } = await admin
    .from('family_links')
    .update({ status: 'revoked', updated_at: new Date().toISOString() } as any)
    .eq('id', id)

  if (error) {
    console.error('[revoke] update error:', error)
    return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })
  }

  // NOTIFICATION FIX: Notify the other family about revocation
  const isFamilyA = myFamilyId === l.family_a_id
  const otherFamilyId = isFamilyA ? l.family_b_id : l.family_a_id
  
  await admin.from('family_link_notifications').insert({
    link_id: id,
    event_type: 'link_revoked',
    recipient_family_id: otherFamilyId,
    created_at: new Date().toISOString()
  } as any)

  return NextResponse.json({ ok: true })
}
