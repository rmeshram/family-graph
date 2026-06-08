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
 * DELETE /api/admin/family/reset
 * Body: { confirm: true }
 *
 * Wipes all family_members rows for the caller's family, then resets all
 * profiles in that family (clears member_id). The family row and all user
 * accounts are preserved so members can immediately start adding members
 * again without re-signing up.
 *
 * Only the family admin can call this.
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (!body?.confirm) {
    return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
  }

  const supabase = await authedClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminClient()

  // Load caller profile
  const { data: profile } = await admin
    .from('profiles')
    .select('role, family_id')
    .eq('id', user.id)
    .single()

  if (!profile?.family_id) {
    return NextResponse.json({ error: 'No family found for your account' }, { status: 400 })
  }

  if ((profile as any).role !== 'admin') {
    return NextResponse.json({ error: 'Only family admins can reset the family tree' }, { status: 403 })
  }

  const familyId: string = (profile as any).family_id

  // ── 1. Delete all family member nodes ────────────────────────────────────
  const { error: membersErr } = await admin
    .from('family_members')
    .delete()
    .eq('family_id', familyId)

  if (membersErr) {
    console.error('[reset-family] delete family_members:', membersErr)
    return NextResponse.json({ error: 'Failed to delete family members: ' + membersErr.message }, { status: 500 })
  }

  // ── 2. Clear member_id links on all profiles in this family ──────────────
  // user_node_links rows cascade-delete when family_members are deleted (FK),
  // but profile.member_id is a plain nullable FK — clear it explicitly.
  await admin
    .from('profiles')
    .update({ member_id: null })
    .eq('family_id', familyId)

  // ── 3. Delete related content rows ───────────────────────────────────────
  // Stories, memories, events, etc. are family-scoped — wipe them too so the
  // family truly starts blank.
  await Promise.allSettled([
    admin.from('stories').delete().eq('family_id', familyId),
    admin.from('memories').delete().eq('family_id', familyId),
    admin.from('events').delete().eq('family_id', familyId),
    admin.from('invite_links').delete().eq('family_id', familyId),
    admin.from('family_link_notifications').delete().eq('family_id', familyId),
  ])

  return NextResponse.json({ ok: true, message: 'Family tree has been reset. All members and content have been deleted.' })
}
