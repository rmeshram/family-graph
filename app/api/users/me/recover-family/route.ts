import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } }
  )
}

/**
 * POST /api/users/me/recover-family
 *
 * Fixes "orphaned members" — the silent-failure state where a user joined a
 * new family but their original family's members were left behind in the old
 * family_id bucket (due to the client-side RLS migration bug).
 *
 * Detection strategy: find all family_members rows where claimed_by_user_id
 * equals the current user AND their family_id differs from the user's current
 * profile.family_id. Those nodes are in an "orphaned" family that was never
 * migrated. For each such orphaned family, migrate ALL its members to the
 * user's current family using the service-role key (bypasses RLS).
 *
 * Safe to call repeatedly — if nothing is orphaned, returns { recovered: 0 }.
 */
export async function POST(req: NextRequest) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  // Get the user's current family_id
  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, member_id')
    .eq('id', user.id)
    .single()

  const currentFamilyId = (profile as any)?.family_id as string | null
  if (!currentFamilyId) {
    return NextResponse.json({ error: 'User has no family', recovered: 0 }, { status: 200 })
  }

  // ── Detection strategy ────────────────────────────────────────────────────
  // We find orphaned families using TWO independent signals (union of both):
  //
  // Signal A — claimed node in wrong family:
  //   family_members.claimed_by_user_id = user.id AND family_id != currentFamilyId
  //   Catches: user claimed a node in their old family via the formal join flow.
  //
  // Signal B — family creator:
  //   families.created_by = user.id AND id != currentFamilyId
  //   Catches: user created a family via onboarding (profile.member_id was null,
  //   so their old node was never formally claimed → Signal A finds nothing).
  //   This is Rahul's exact scenario — he was the MESHRAM family admin with
  //   member_id = null, so his nodes had no claimed_by_user_id set.

  // Signal A: orphaned claimed nodes
  const { data: claimedOrphans } = await admin
    .from('family_members')
    .select('family_id')
    .eq('claimed_by_user_id', user.id)
    .neq('family_id', currentFamilyId)

  // Signal B: families the user created that aren't their current family
  const { data: createdFamilies } = await admin
    .from('families')
    .select('id')
    .eq('created_by', user.id)
    .neq('id', currentFamilyId)

  const orphanedFamilyIds = [
    ...new Set([
      ...((claimedOrphans ?? []) as any[]).map((r: any) => r.family_id as string),
      ...((createdFamilies ?? []) as any[]).map((r: any) => r.id as string),
    ])
  ].filter(id => id && id !== currentFamilyId)

  if (orphanedFamilyIds.length === 0) {
    return NextResponse.json({ recovered: 0, message: 'Nothing to recover' })
  }

  let totalMigrated = 0
  const errors: string[] = []

  for (const orphanedFamilyId of orphanedFamilyIds) {
    if (orphanedFamilyId === currentFamilyId) continue

    const { data: movedRows, error: moveErr } = await admin
      .from('family_members')
      .update({ family_id: currentFamilyId })
      .eq('family_id', orphanedFamilyId)
      .select('id')

    if (moveErr) {
      console.error(`[recover-family] failed to migrate ${orphanedFamilyId}:`, moveErr.message)
      errors.push(moveErr.message)
    } else {
      const count = (movedRows ?? []).length
      totalMigrated += count
      console.log(`[recover-family] migrated ${count} members from ${orphanedFamilyId} → ${currentFamilyId}`)
    }
  }

  // Also fix any other profiles that still have the old family_id set,
  // so other users in the orphaned family can also see the merged tree.
  // (Only update profiles that aren't the current user — the current user's
  //  profile.family_id is already correct.)
  for (const orphanedFamilyId of orphanedFamilyIds) {
    if (orphanedFamilyId === currentFamilyId) continue
    await admin
      .from('profiles')
      .update({ family_id: currentFamilyId })
      .eq('family_id', orphanedFamilyId)
      .neq('id', user.id)
  }

  return NextResponse.json({
    recovered: totalMigrated,
    orphanedFamilies: orphanedFamilyIds.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
