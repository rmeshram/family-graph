#!/usr/bin/env npx tsx
/**
 * scripts/backfill-normalize.ts
 *
 * One-shot CLI backfill: runs the normalization pipeline against LIVE Supabase
 * data and either prints a dry-run report (default) or executes the fixes.
 *
 * Usage:
 *   npx tsx scripts/backfill-normalize.ts                  # dry-run: show plan
 *   npx tsx scripts/backfill-normalize.ts --execute        # write to DB
 *   npx tsx scripts/backfill-normalize.ts --family <uuid>  # scope to one family
 *   npx tsx scripts/backfill-normalize.ts --execute --family <uuid>
 *
 * Environment:
 *   Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 *   (or any environment variables already set in the shell).
 *
 * Output:
 *   - Console summary
 *   - BACKFILL_NORMALIZE_REPORT_<timestamp>.json written to project root
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

// Node 20 does not expose native WebSocket globally; @supabase/realtime-js throws
// on client construction if globalThis.WebSocket is missing.
// For CLI scripts that never use realtime channels, a no-op shim is sufficient.
if (typeof (globalThis as any).WebSocket === 'undefined') {
  ;(globalThis as any).WebSocket = class NoopWebSocket {
    constructor() {}
    close() {}
  }
}

// ─── Load .env.local ──────────────────────────────────────────────────────────
// Next.js loads .env.local automatically; for tsx we need to do it manually.
// Use a sync require so this works under both CommonJS and ESM tsx invocations.
import { existsSync, readFileSync } from 'fs'

function loadDotEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}
loadDotEnvLocal()

import {
  fetchFamilyRows,
  planNormalization,
  executeNormalizationPlan,
  buildSnapshots,
  type NormalizationPlan,
  type MemberSnapshot,
} from '../lib/db-normalizer'

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const EXECUTE = args.includes('--execute')
const familyArgIdx = args.indexOf('--family')
const FAMILY_ID_FILTER: string | null =
  familyArgIdx !== -1 ? (args[familyArgIdx + 1] ?? null) : null

// ─── Supabase admin client ────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error(
    '\n❌  Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY\n' +
    '    Set them in .env.local or export them in your shell.\n',
  )
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ─── Fetch all (or one) family IDs ───────────────────────────────────────────

async function getAllFamilyIds(): Promise<string[]> {
  if (FAMILY_ID_FILTER) return [FAMILY_ID_FILTER]

  const { data, error } = await admin.from('families').select('id').order('created_at')
  if (error) throw new Error(`Could not list families: ${error.message}`)
  return (data ?? []).map((r: any) => r.id as string)
}

// ─── Per-family processing ────────────────────────────────────────────────────

interface FamilyReport {
  familyId: string
  memberCount: number
  plan: NormalizationPlan
  before: MemberSnapshot[]
  after: MemberSnapshot[]
  mutations?: {
    mergesApplied: number
    refRewrites: number
    fieldFixesApplied: number
    softDeleted: number
  }
  error?: string
}

async function processFamily(familyId: string): Promise<FamilyReport> {
  const rawRows = await fetchFamilyRows(admin as any, familyId)
  const plan = planNormalization(rawRows, familyId)
  const { before, after } = buildSnapshots(rawRows, plan)

  const base: FamilyReport = {
    familyId,
    memberCount: rawRows.length,
    plan,
    before,
    after,
  }

  if (!EXECUTE) return base

  // Execute and attach mutation counts
  const mutations = await executeNormalizationPlan(admin as any, plan, 'backfill-script')
  return { ...base, mutations }
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function hr(char = '─', len = 60) { return char.repeat(len) }

function printPlan(plan: NormalizationPlan) {
  console.log(`\n  Members: ${plan.summary.totalMembers}`)
  console.log(`  Auto-merges:  ${plan.summary.autoMerges}`)
  console.log(`  Field fixes:  ${plan.summary.fieldFixes}`)
  console.log(`  Human review: ${plan.summary.humanReview}`)

  if (plan.merges.length > 0) {
    console.log('\n  ─── Identity Merges ─────────────────────────────────────')
    for (const m of plan.merges) {
      console.log(
        `  [${m.confidence}%] "${m.canonicalName}" ← "${m.duplicateName}"` +
        `  (${m.matchReasons.join(', ')})`,
      )
      if (Object.keys(m.canonicalPatch).length > 0) {
        console.log(`         fields transferred: ${Object.keys(m.canonicalPatch).join(', ')}`)
      }
      if (m.refRewriteCount > 0) {
        console.log(`         ref rewrites:        ${m.refRewriteCount} other nodes`)
      }
    }
  }

  if (plan.fieldFixes.length > 0) {
    console.log('\n  ─── Field Fixes ─────────────────────────────────────────')
    for (const f of plan.fieldFixes) {
      console.log(`  ${f.memberName} [${f.memberId.slice(0, 8)}…] ${f.field}: ${f.reason}`)
    }
  }

  if (plan.humanReviewQueue.length > 0) {
    console.log('\n  ─── Flagged for Human Review ────────────────────────────')
    for (const pd of plan.humanReviewQueue) {
      console.log(
        `  [${pd.confidence}%] "${pd.nameA}" vs "${pd.nameB}"  (${pd.matchReasons.join(', ')})`,
      )
    }
  }
}

function printDiff(before: MemberSnapshot[], after: MemberSnapshot[]) {
  const afterById = new Map(after.map(a => [a.id, a]))

  const changed = before.filter(b => {
    if (b.status === 'merged_away') return true
    const a = afterById.get(b.id)
    if (!a) return false
    return (
      JSON.stringify([...b.parentIds].sort()) !== JSON.stringify([...a.parentIds].sort()) ||
      JSON.stringify([...b.spouseIds].sort()) !== JSON.stringify([...a.spouseIds].sort()) ||
      b.generation !== a.generation
    )
  })

  if (changed.length === 0) {
    console.log('\n  ✔ No changes needed.')
    return
  }

  console.log(`\n  ─── Graph Diff (${changed.length} nodes) ─────────────────────────────`)
  for (const b of changed) {
    if (b.status === 'merged_away') {
      console.log(`  - ${b.name} [${b.id.slice(0, 8)}…]  SOFT-DELETED → merged into ${b.mergedInto?.slice(0, 8)}…`)
      continue
    }
    const a = afterById.get(b.id)!
    console.log(`  ~ ${b.name} [${b.id.slice(0, 8)}…]`)
    if (JSON.stringify([...b.parentIds].sort()) !== JSON.stringify([...a.parentIds].sort())) {
      console.log(`      parentIds: [${b.parentIds.map(id => id.slice(0, 8)).join(', ')}]`)
      console.log(`             → [${a.parentIds.map(id => id.slice(0, 8)).join(', ')}]`)
    }
    if (JSON.stringify([...b.spouseIds].sort()) !== JSON.stringify([...a.spouseIds].sort())) {
      console.log(`      spouseIds: [${b.spouseIds.map(id => id.slice(0, 8)).join(', ')}]`)
      console.log(`             → [${a.spouseIds.map(id => id.slice(0, 8)).join(', ')}]`)
    }
    if (b.generation !== a.generation) {
      console.log(`      generation: ${b.generation} → ${a.generation}`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(hr('═'))
  console.log(EXECUTE
    ? '  BACKFILL NORMALIZE — EXECUTE MODE'
    : '  BACKFILL NORMALIZE — DRY-RUN (no DB writes)')
  console.log(hr('═'))
  if (FAMILY_ID_FILTER) console.log(`  Scoped to family: ${FAMILY_ID_FILTER}`)
  console.log(`  Supabase: ${supabaseUrl?.replace(/^https?:\/\//, '').split('.')[0]}…`)
  console.log()

  let familyIds: string[]
  try {
    familyIds = await getAllFamilyIds()
  } catch (err) {
    console.error('❌  Could not list families:', (err as Error).message)
    process.exit(1)
  }

  if (familyIds.length === 0) {
    console.log('  No families found.')
    process.exit(0)
  }

  console.log(`  Processing ${familyIds.length} family/families…\n`)

  const reports: FamilyReport[] = []
  let totalMerges = 0
  let totalFixes = 0
  let totalReview = 0

  for (const familyId of familyIds) {
    console.log(hr())
    console.log(`  Family: ${familyId}`)
    try {
      const report = await processFamily(familyId)
      reports.push(report)
      totalMerges += report.plan.summary.autoMerges
      totalFixes += report.plan.summary.fieldFixes
      totalReview += report.plan.summary.humanReview
      printPlan(report.plan)
      printDiff(report.before, report.after)
      if (EXECUTE && report.mutations) {
        console.log('\n  ✔ Applied:')
        console.log(`    merges:     ${report.mutations.mergesApplied}`)
        console.log(`    ref writes: ${report.mutations.refRewrites}`)
        console.log(`    field fixes:${report.mutations.fieldFixesApplied}`)
        console.log(`    soft-deleted:${report.mutations.softDeleted}`)
      }
    } catch (err) {
      const msg = (err as Error).message
      console.error(`  ❌ Error: ${msg}`)
      reports.push({
        familyId,
        memberCount: 0,
        plan: { familyId, merges: [], fieldFixes: [], humanReviewQueue: [], summary: { totalMembers: 0, autoMerges: 0, fieldFixes: 0, humanReview: 0 } },
        before: [],
        after: [],
        error: msg,
      })
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n' + hr('═'))
  console.log('  SUMMARY')
  console.log(hr('═'))
  console.log(`  Families processed: ${familyIds.length}`)
  console.log(`  Total auto-merges:  ${totalMerges}`)
  console.log(`  Total field fixes:  ${totalFixes}`)
  console.log(`  Human review queue: ${totalReview}`)
  if (!EXECUTE && (totalMerges > 0 || totalFixes > 0)) {
    console.log('\n  Run with --execute to apply these changes.')
  }

  // ── Write JSON report ─────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outFile = resolve(
    process.cwd(),
    `BACKFILL_NORMALIZE_REPORT_${EXECUTE ? 'EXECUTED' : 'DRYRUN'}_${timestamp}.json`,
  )

  const fullReport = {
    generatedAt: new Date().toISOString(),
    mode: EXECUTE ? 'execute' : 'dry-run',
    familyFilter: FAMILY_ID_FILTER,
    totalFamilies: familyIds.length,
    totalAutoMerges: totalMerges,
    totalFieldFixes: totalFixes,
    humanReviewCount: totalReview,
    families: reports,
  }

  writeFileSync(outFile, JSON.stringify(fullReport, null, 2), 'utf-8')
  console.log(`\n  Report written to: ${outFile}`)
  console.log(hr('═') + '\n')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
