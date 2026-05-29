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

  // ── Step 1: Unclaim linked node if present ────────────────────────────────
  const { data: profile } = await admin
    .from('profiles')
    .select('member_id')
    .eq('id', user.id)
    .single()

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

  // ── Step 3: Delete the auth account (cascades profile row) ────────────────
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id)
  if (deleteErr) {
    console.error('[delete-account] auth.admin.deleteUser failed:', deleteErr)
    return NextResponse.json({ error: 'Failed to delete account. Please contact support.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
