/**
 * GET  /api/admin/normalize-graph  — dry-run: returns the full normalization plan
 * POST /api/admin/normalize-graph  — execute: applies the plan to the DB
 *
 * Both require: authenticated admin user with a family.
 *
 * GET response:
 *   { plan, before, after }  — what would be changed, no DB writes
 *
 * POST response:
 *   { plan, before, after, mutations }  — same + applied mutation counts
 *
 * The "before" and "after" fields are compact graph snapshots showing each
 * member's id / name / generation / parentIds / spouseIds before and after
 * the normalization pass. Use them to diff duplicate relationships visually.
 *
 * ─── Why this is needed ────────────────────────────────────────────────────
 * The in-memory normalization pipeline (lib/graph-layout-engine.ts) runs only
 * in CLI scripts. The production UI reads raw DB rows → renders them directly.
 * Duplicates that the pipeline detects are never written back to Supabase, so
 * they appear again on every page load. This endpoint closes the gap.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  fetchFamilyRows,
  planNormalization,
  executeNormalizationPlan,
  buildSnapshots,
} from '@/lib/db-normalizer'

// ─── Supabase clients ─────────────────────────────────────────────────────────

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
          try { c.forEach(({ name, value, options }) => cs.set(name, value, options)) } catch { }
        },
      },
    },
  )
}

// ─── Auth + family guard ──────────────────────────────────────────────────────

async function requireAdmin(): Promise<
  | { error: NextResponse }
  | { user: { id: string }; profile: { family_id: string; role: string } }
> {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) }
  }

  const admin = adminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as any).role !== 'admin') {
    return { error: NextResponse.json({ error: 'FORBIDDEN — admin role required' }, { status: 403 }) }
  }

  const familyId: string | null = (profile as any).family_id ?? null
  if (!familyId) {
    return { error: NextResponse.json({ error: 'NO_FAMILY' }, { status: 400 }) }
  }

  return { user: { id: user.id }, profile: { family_id: familyId, role: (profile as any).role } }
}

// ─── GET — dry-run scan ───────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { profile } = auth
  const admin = adminClient()

  try {
    const rawRows = await fetchFamilyRows(admin as any, profile.family_id)
    const plan = planNormalization(rawRows, profile.family_id)
    const { before, after } = buildSnapshots(rawRows, plan)

    return NextResponse.json({
      dryRun: true,
      plan,
      before,
      after,
      changedNodes: before.filter((b, i) => {
        const a = after.find(a => a.id === b.id)
        if (!a) return true // merged away
        return (
          JSON.stringify([...b.parentIds].sort()) !== JSON.stringify([...a.parentIds].sort()) ||
          JSON.stringify([...b.spouseIds].sort()) !== JSON.stringify([...a.spouseIds].sort()) ||
          b.generation !== a.generation
        )
      }).length,
    })
  } catch (err) {
    console.error('[normalize-graph GET]', err)
    return NextResponse.json(
      { error: 'PLAN_FAILED', detail: (err as Error).message },
      { status: 500 },
    )
  }
}

// ─── POST — execute ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { user, profile } = auth
  const admin = adminClient()

  // Optional: caller can pass { confirm: true } to guard against accidental POSTs
  let body: { confirm?: boolean } = {}
  try { body = await req.json() } catch { }
  if (body.confirm === false) {
    return NextResponse.json(
      { error: 'CONFIRMATION_REQUIRED', message: 'Pass { confirm: true } to execute.' },
      { status: 400 },
    )
  }

  try {
    // 1. Read current DB state
    const rawRows = await fetchFamilyRows(admin as any, profile.family_id)

    // 2. Build plan
    const plan = planNormalization(rawRows, profile.family_id)

    // 3. Snapshot before
    const { before, after } = buildSnapshots(rawRows, plan)

    if (plan.merges.length === 0 && plan.fieldFixes.length === 0) {
      return NextResponse.json({
        executed: false,
        message: 'No changes needed — family graph is already normalized.',
        plan,
        before,
        after,
        mutations: { mergesApplied: 0, refRewrites: 0, fieldFixesApplied: 0, softDeleted: 0 },
      })
    }

    // 4. Execute
    const mutations = await executeNormalizationPlan(admin as any, plan, user.id)

    return NextResponse.json({
      executed: true,
      plan,
      before,
      after,
      mutations,
    })
  } catch (err) {
    console.error('[normalize-graph POST]', err)
    return NextResponse.json(
      { error: 'EXECUTION_FAILED', detail: (err as Error).message },
      { status: 500 },
    )
  }
}
