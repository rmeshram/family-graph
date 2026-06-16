#!/usr/bin/env npx tsx
/**
 * scripts/run-persist-demo.ts
 *
 * Demonstrates the normalization persistence layer against sample data.
 * Shows the full before/after graph JSON without touching any live database.
 *
 * Usage:  npx tsx scripts/run-persist-demo.ts
 * Output: PERSIST_DEMO_REPORT.json
 */

import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { sampleFamilyMembers } from '../lib/sample-data'
import {
  planNormalization,
  buildSnapshots,
  type MemberSnapshot,
} from '../lib/db-normalizer'

// Convert FamilyMember[] to raw DB row format (simulate what fetchFamilyRows returns)
function memberToRow(m: (typeof sampleFamilyMembers)[number]): Record<string, unknown> {
  return {
    id: m.id,
    name: m.name,
    birth_year: m.birthYear ?? null,
    birth_month: (m as any).birthMonth ?? null,
    birth_day: (m as any).birthDay ?? null,
    death_year: m.deathYear ?? null,
    birth_place: m.birthPlace ?? null,
    current_place: m.currentPlace ?? null,
    photo_url: m.photoUrl ?? null,
    bio: m.bio ?? null,
    relationship: m.relationship ?? null,
    occupation: m.occupation ?? null,
    parent_ids: m.parentIds ?? [],
    spouse_ids: m.spouseIds ?? [],
    generation: m.generation,
    is_alive: m.isAlive ?? true,
    gender: m.gender ?? null,
    tags: m.tags ?? [],
    side: m.side ?? null,
    role: m.role ?? null,
    gotra: m.gotra ?? null,
    caste: m.caste ?? null,
    hometown: m.hometown ?? null,
    native_language: m.nativeLanguage ?? null,
    religion: m.religion ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    instagram_handle: (m as any).instagramHandle ?? null,
    added_at: m.addedAt ?? new Date().toISOString(),
    claimed_by_user_id: m.claimedByUserId ?? null,
    is_claimed: m.isClaimed ?? false,
    visibility: m.visibility ?? 'family',
    claim_status: m.claimStatus ?? 'unclaimed',
    claimed_at: m.claimedAt ?? null,
    is_deceased: m.isDeceased ?? false,
    show_as_anonymous: m.showAsAnonymous ?? false,
    is_biodata_visible: m.isBiodataVisible ?? false,
    network_group: m.networkGroup ?? 'core',
    affiliated_family_id: m.affiliatedFamilyId ?? null,
    affiliated_family_name: m.affiliatedFamilyName ?? null,
    affiliated_junction_id: m.affiliatedJunctionId ?? null,
    deleted_at: null,
    family_id: 'sample-family-id',
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('═'.repeat(60))
console.log('  NORMALIZATION PERSISTENCE DEMO — sample data')
console.log('═'.repeat(60))
console.log(`\n  Input members: ${sampleFamilyMembers.length}`)

const rawRows = sampleFamilyMembers.map(memberToRow)
const FAMILY_ID = 'sample-family-id'

const plan = planNormalization(rawRows, FAMILY_ID)
const { before, after } = buildSnapshots(rawRows, plan)

// ─── Console summary ──────────────────────────────────────────────────────────

console.log('\n─── Normalization Plan ──────────────────────────────────────')
console.log(`  Total members:    ${plan.summary.totalMembers}`)
console.log(`  Auto-merges:      ${plan.summary.autoMerges}`)
console.log(`  Field fixes:      ${plan.summary.fieldFixes}`)
console.log(`  Human review:     ${plan.summary.humanReview}`)

if (plan.merges.length > 0) {
  console.log('\n─── Identity Merges (auto-merged) ───────────────────────────')
  for (const m of plan.merges) {
    console.log(`  [${m.confidence}%] "${m.canonicalName}" ← "${m.duplicateName}"`)
    console.log(`         Reasons: ${m.matchReasons.join(', ')}`)
    const patchKeys = Object.keys(m.canonicalPatch)
    if (patchKeys.length > 0) {
      console.log(`         Fields transferred: ${patchKeys.join(', ')}`)
    }
    console.log(`         Ref rewrites needed: ${m.refRewriteCount}`)
  }
}

if (plan.fieldFixes.length > 0) {
  console.log('\n─── Field Fixes ─────────────────────────────────────────────')
  for (const f of plan.fieldFixes) {
    console.log(`  ${f.memberName}  [${f.field}]`)
    console.log(`         ${f.reason}`)
  }
}

if (plan.humanReviewQueue.length > 0) {
  console.log('\n─── Human Review Queue (NOT auto-merged) ────────────────────')
  for (const pd of plan.humanReviewQueue) {
    console.log(`  [${pd.confidence}%] "${pd.nameA}" vs "${pd.nameB}"  (${pd.matchReasons.join(', ')})`)
  }
}

// ─── Graph diff ───────────────────────────────────────────────────────────────

const afterById = new Map<string, MemberSnapshot>(after.map(a => [a.id, a]))
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

console.log(`\n─── Graph Diff (${changed.length} nodes changed / ${before.length} total) ─────────────`)
if (changed.length === 0) {
  console.log('  ✔ No changes — sample data is already fully normalized.')
} else {
  for (const b of changed) {
    if (b.status === 'merged_away') {
      console.log(`  REMOVED  "${b.name}" [${b.id}]`)
      console.log(`           → merged into ${b.mergedInto}`)
      continue
    }
    const a = afterById.get(b.id)!
    const lines: string[] = []
    if (JSON.stringify([...b.parentIds].sort()) !== JSON.stringify([...a.parentIds].sort())) {
      lines.push(`    parentIds: ${JSON.stringify(b.parentIds)} → ${JSON.stringify(a.parentIds)}`)
    }
    if (JSON.stringify([...b.spouseIds].sort()) !== JSON.stringify([...a.spouseIds].sort())) {
      lines.push(`    spouseIds: ${JSON.stringify(b.spouseIds)} → ${JSON.stringify(a.spouseIds)}`)
    }
    if (b.generation !== a.generation) {
      lines.push(`    generation: ${b.generation} → ${a.generation}`)
    }
    if (lines.length > 0) {
      console.log(`  CHANGED  "${b.name}" [${b.id}]`)
      lines.forEach(l => console.log(l))
    }
  }
}

// ─── Write report ─────────────────────────────────────────────────────────────

const reportPath = resolve(process.cwd(), 'PERSIST_DEMO_REPORT.json')

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'dry-run (sample data)',
  inputMemberCount: sampleFamilyMembers.length,
  plan,
  summary: {
    membersAfterNormalization: after.length,
    mergesApplied: plan.merges.length,
    fieldFixesApplied: plan.fieldFixes.length,
    humanReviewCount: plan.humanReviewQueue.length,
    changedNodes: changed.length,
  },
  graphDiff: {
    before,
    after,
    changed: changed.map(b => {
      if (b.status === 'merged_away') {
        return { id: b.id, name: b.name, change: 'soft_deleted', mergedInto: b.mergedInto }
      }
      const a = afterById.get(b.id)!
      return {
        id: b.id,
        name: b.name,
        change: 'updated',
        parentIds: { before: b.parentIds, after: a.parentIds },
        spouseIds: { before: b.spouseIds, after: a.spouseIds },
        generation: b.generation !== a.generation
          ? { before: b.generation, after: a.generation }
          : undefined,
      }
    }),
  },
}

writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')

console.log(`\n${'═'.repeat(60)}`)
console.log(`  Report written: PERSIST_DEMO_REPORT.json`)
console.log('═'.repeat(60))
