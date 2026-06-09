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

/**
 * POST /api/families/leave
 *
 * Removes the calling user from their current family:
 *  1. If they have a claimed node, unclaim it (return it to available).
 *  2. Clear profiles.family_id, member_id, role so they become unaffiliated.
 *
 * Guards:
 *  - Admins cannot leave if they are the ONLY admin — would orphan the family.
 *  - User must be in a family to leave.
 */
export async function POST() {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  // Fetch caller's profile
  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, member_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !(profile as any).family_id) {
    return NextResponse.json({ error: 'NOT_IN_FAMILY', message: 'You are not currently in a family.' }, { status: 400 })
  }

  const familyId = (profile as any).family_id as string
  const memberId = (profile as any).member_id as string | null
  const role = (profile as any).role as string

  // Guard: sole admin cannot leave — would orphan the family with no one to manage it.
  if (role === 'admin') {
    const { count } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', familyId)
      .eq('role', 'admin')

    if ((count ?? 0) <= 1) {
      return NextResponse.json({
        error: 'SOLE_ADMIN',
        message: 'You are the only admin. Transfer admin rights to another member before leaving, or delete the family.',
      }, { status: 403 })
    }
  }

  // 1. Unclaim the user's node if they have one
  if (memberId) {
    const { data: node } = await admin
      .from('family_members')
      .select('is_claimed, claimed_by_user_id')
      .eq('id', memberId)
      .single()

    if (node && (node as any).is_claimed && (node as any).claimed_by_user_id === user.id) {
      await admin.from('family_members').update({
        is_claimed: false,
        claimed_by_user_id: null,
        claim_status: 'unclaimed',
        claimed_at: null,
      } as any).eq('id', memberId)

      // Audit log
      await admin.from('claim_audit_log').insert({
        node_id: memberId,
        family_id: familyId,
        actor_id: user.id,
        action: 'claim_unclaimed',
        metadata: { reason: 'user_left_family' },
      } as any)
    }
  }

  // 2. Clear family membership from profile
  await admin.from('profiles').update({
    family_id: null,
    member_id: null,
    role: 'viewer',
  } as any).eq('id', user.id)

  return NextResponse.json({ success: true })
}
