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

const VALID_ROLES = ['admin', 'contributor', 'viewer'] as const

/**
 * PATCH /api/admin/members/[userId]/role
 * Body: { role: 'admin' | 'contributor' | 'viewer' }
 *
 * Updates another family member's role. Caller must be an admin of the same
 * family as the target user. Uses the service-role client to bypass RLS
 * (the profiles: own row policy blocks cross-user updates via anon key).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  if (user.id === userId) return NextResponse.json({ error: 'Cannot change your own role this way' }, { status: 400 })

  let body: { role?: string }
  try { body = await req.json() } catch { body = {} }

  const { role } = body
  if (!VALID_ROLES.includes(role as any)) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
  }

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

  // Verify target user belongs to the same family
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', userId)
    .single()

  if ((targetProfile as any)?.family_id !== callerFamilyId) {
    return NextResponse.json({ error: 'FORBIDDEN — target user is not in your family' }, { status: 403 })
  }

  // ISSUE-09: last-admin guard — prevent demoting the only admin
  const targetCurrentRole: string = (targetProfile as any)?.role ?? 'viewer'
  if (targetCurrentRole === 'admin' && role !== 'admin') {
    const { count: adminCount } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', callerFamilyId)
      .eq('role', 'admin')
    if ((adminCount ?? 0) <= 1) {
      return NextResponse.json({
        error: 'LAST_ADMIN',
        message: 'Cannot demote the only admin of a family. Promote another member to admin first.',
      }, { status: 409 })
    }
  }

  const { error } = await admin
    .from('profiles')
    .update({ role } as any)
    .eq('id', userId)

  if (error) {
    console.error('[admin/members/role] update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId, role })
}
