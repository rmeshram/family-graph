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

/**
 * POST /api/admin/members/[userId]/remove
 *
 * Removes a user from the family by setting family_id = null and role = 'viewer'.
 * Caller must be an admin of the same family as the target user.
 * Uses the service-role client to bypass RLS on the profiles table.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  if (user.id === userId) return NextResponse.json({ error: 'Cannot remove yourself from the family' }, { status: 400 })

  const admin = adminClient()

  // Verify caller is admin of their family
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, family_id')
    .eq('id', user.id)
    .single()

  if ((callerProfile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN — admin role required' }, { status: 403 })
  }

  const callerFamilyId: string | null = (callerProfile as any)?.family_id ?? null
  if (!callerFamilyId) {
    return NextResponse.json({ error: 'Caller has no family' }, { status: 400 })
  }

  // ISSUE-09: last-admin guard — prevent removing the only admin
  if ((callerProfile as any)?.role === 'admin') {
    const { count: adminCount } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', callerFamilyId)
      .eq('role', 'admin')
    if ((adminCount ?? 0) <= 1 && user.id === userId) {
      // Caller is trying to remove themselves as the sole admin — already blocked above
      // (self-remove blocked at line ~48). But guard anyway.
      return NextResponse.json({ error: 'LAST_ADMIN', message: 'Cannot remove the only admin of a family.' }, { status: 409 })
    }
  }

  // Verify target user belongs to the same family and get their claimed node
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('family_id, member_id')
    .eq('id', userId)
    .single()

  if ((targetProfile as any)?.family_id !== callerFamilyId) {
    return NextResponse.json({ error: 'FORBIDDEN — target user is not in your family' }, { status: 403 })
  }

  const targetMemberId: string | null = (targetProfile as any)?.member_id ?? null

  // ISSUE-09: if the target is an admin, ensure they're not the last admin
  const { data: targetProfileRole } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if ((targetProfileRole as any)?.role === 'admin') {
    const { count: adminCount } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', callerFamilyId)
      .eq('role', 'admin')
    if ((adminCount ?? 0) <= 1) {
      return NextResponse.json({ error: 'LAST_ADMIN', message: 'Cannot remove the only admin of a family. Promote another admin first.' }, { status: 409 })
    }
  }

  const now = new Date().toISOString()

  // ISSUE-08: unclaim the removed user's node before clearing their profile
  if (targetMemberId) {
    await admin.from('family_members').update({
      is_claimed: false,
      claimed_by_user_id: null,
      claim_status: 'unclaimed',
      claimed_at: null,
    } as any).eq('id', targetMemberId).eq('claimed_by_user_id', userId)

    // Remove user_node_links rows for the target user
    await admin.from('user_node_links' as any).delete().eq('user_id', userId)

    // Audit log
    await admin.from('claim_audit_log' as any).insert({
      node_id: targetMemberId,
      family_id: callerFamilyId,
      actor_id: user.id,
      action: 'claim_revoked',
      metadata: { reason: 'member_removed_by_admin', removed_at: now },
    })
  }

  const { error } = await admin
    .from('profiles')
    .update({ family_id: null, role: 'viewer', member_id: null } as any)
    .eq('id', userId)

  if (error) {
    console.error('[admin/members/remove] update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ISSUE-18: invalidate all active sessions for the removed user.
  // Their JWT is still valid until its expiry (~1 hour); signing them out revokes
  // the refresh token so they cannot renew after the current JWT expires.
  try {
    await (admin as any).auth.admin.signOut(userId)
  } catch { /* best-effort — sessions expire naturally within 1 hour */ }

  return NextResponse.json({ ok: true, userId })
}
