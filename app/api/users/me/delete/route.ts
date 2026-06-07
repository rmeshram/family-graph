import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } },
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
          try {
            c.forEach(({ name, value, options }) => cs.set(name, value, options))
          } catch { }
        },
      },
    },
  )
}

/**
 * DELETE /api/users/me/delete
 *
 * Permanently deletes the calling user's account and removes their
 * claim from any linked family-member node.
 *
 * Steps:
 *  1. Authenticate via session cookie (anon client).
 *  2. Unclaim the user's node if one is linked (profile.member_id).
 *  3. Delete the auth user via admin client (cascades profile via FK/trigger).
 *
 * Body: { confirm: true }   — explicit client-side confirmation required.
 */
export async function DELETE(req: Request) {
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

  // ── Step 0: Load full profile ─────────────────────────────────────────────
  const { data: profile } = await admin
    .from('profiles')
    .select('member_id, family_id, role')
    .eq('id', user.id)
    .single()

  // RF-04: Guard — cannot delete if last admin of a family.
  // Deleting the last admin orphans the family: no one can manage roles, revoke
  // claims, or respond to link requests. Require handoff first.
  if ((profile as any)?.family_id && (profile as any)?.role === 'admin') {
    const { count: remainingAdmins } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', (profile as any).family_id)
      .eq('role', 'admin')
      .neq('id', user.id)
    if ((remainingAdmins ?? 0) === 0) {
      return NextResponse.json(
        {
          error: 'LAST_ADMIN',
          message: 'You are the only admin of your family. Please promote another member to admin before deleting your account.',
        },
        { status: 409 }
      )
    }
  }

  // ── Step 1: Unclaim linked node if present ────────────────────────────────
  if (profile?.member_id) {
    // Clear claim fields on the node — return it to unclaimed state so the
    // family admin can re-assign it if needed.
    await admin
      .from('family_members')
      .update({
        is_claimed: false,
        claimed_by_user_id: null,
        claim_status: 'unclaimed',
        claimed_at: null,
      })
      .eq('id', profile.member_id)
      .eq('claimed_by_user_id', user.id) // safety: only unclaim own node
  }

  // ── Step 2: Clear the profile's family & member link ──────────────────────
  await admin
    .from('profiles')
    .update({ member_id: null, family_id: null })
    .eq('id', user.id)

  // ── Step 2.5: Clean up user_node_links rows ───────────────────────────────
  // RF-04: Without this, user_node_links rows remain after auth.admin.deleteUser().
  // If the FK is ON DELETE RESTRICT/NO ACTION this causes the deleteUser call to
  // fail with a FK violation. If CASCADE, rows are cleaned automatically but
  // explicit cleanup ensures intent is clear and avoids race with trigger timing.
  await admin.from('user_node_links').delete().eq('user_id', user.id)

  // ── Step 2.7: Anonymize authored family content ───────────────────────────
  // ISSUE-23: stories, memories, and voice notes belong to the family, not the
  // leaving user. Null out the author FK instead of deleting the content so the
  // family retains their history. The rows are preserved as anonymous contributions.
  await admin.from('stories').update({ author_id: null } as any).eq('author_id', user.id).then(() => {})
  await admin.from('memories').update({ uploaded_by: null } as any).eq('uploaded_by', user.id).then(() => {})
  await admin.from('voice_notes').update({ recorded_by: null } as any).eq('recorded_by', user.id).then(() => {})

  // ── Step 3: Delete the auth account (cascades profile row) ────────────────
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id)
  if (deleteErr) {
    console.error('[delete-account] auth.admin.deleteUser failed:', deleteErr)
    return NextResponse.json({ error: 'Failed to delete account. Please contact support.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
