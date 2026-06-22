#!/usr/bin/env npx tsx
/**
 * scripts/fix-family-graph.ts
 *
 * Targeted integrity fix for the Meshram family (816baa44).
 *
 * Detects and repairs these specific structural bugs:
 *   BUG-1  spouse_is_parent  — shikha.spouseIds contains PL (her father)
 *   BUG-2  missing_spouse    — PL ↔ Pushpa have no bidirectional spouse link
 *   BUG-3  wrong_generation  — Shubham.generation = 0 (should be 3)
 *   BUG-4  wrong_rel_label   — Shubham.relationship = "brother" (should be "brother-in-law")
 *   BUG-5  missing_spouse    — Shubham has no spouse link to Shuchita
 *   BUG-6  placeholder_merge — "Mr. shuchi" is a placeholder for Shubham in shuchita's spouseIds
 *
 * Usage:
 *   npx tsx scripts/fix-family-graph.ts            # dry-run
 *   npx tsx scripts/fix-family-graph.ts --execute  # apply to DB
 *   npx tsx scripts/fix-family-graph.ts --family <uuid>  # different family
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Node 20 WebSocket shim
if (typeof (globalThis as any).WebSocket === 'undefined') {
  ;(globalThis as any).WebSocket = class NoopWebSocket { constructor() {} close() {} }
}

function loadEnv() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

const EXECUTE = process.argv.includes('--execute')
const familyArgIdx = process.argv.indexOf('--family')
const FAMILY_ID = familyArgIdx !== -1
  ? (process.argv[familyArgIdx + 1] ?? '816baa44-d9ff-47ff-842a-77a23991398b')
  : '816baa44-d9ff-47ff-842a-77a23991398b'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// ─── Fetch all members ────────────────────────────────────────────────────────

interface DBMember {
  id: string; name: string; relationship: string | null
  generation: number; parent_ids: string[]; spouse_ids: string[]
  network_group: string | null; family_id: string
}

async function fetchMembers(): Promise<DBMember[]> {
  const { data, error } = await admin
    .from('family_members')
    .select('id, name, relationship, generation, parent_ids, spouse_ids, network_group, family_id')
    .eq('family_id', FAMILY_ID)
    .is('deleted_at', null)
  if (error) throw new Error('fetchMembers: ' + error.message)
  return (data ?? []) as DBMember[]
}

// ─── Fix descriptor ───────────────────────────────────────────────────────────

interface FixOp {
  id: string           // bug ID
  memberId: string
  memberName: string
  field: string
  before: unknown
  after: unknown
  severity: 'error' | 'warning'
  description: string
}

interface DBPatch {
  id: string
  patch: Record<string, unknown>
  softDelete?: boolean
}

// ─── Detection: find all bugs ─────────────────────────────────────────────────

function detectBugs(rows: DBMember[]): { fixes: FixOp[]; patches: DBPatch[] } {
  const byId = new Map<string, DBMember>(rows.map(r => [r.id, r]))
  const fixes: FixOp[] = []
  const patches: DBPatch[] = []
  const patchMap = new Map<string, Record<string, unknown>>()

  const getPatch = (id: string) => {
    if (!patchMap.has(id)) patchMap.set(id, {})
    return patchMap.get(id)!
  }

  // ── BUG-1: spouse_is_parent ───────────────────────────────────────────────
  for (const m of rows) {
    for (const spouseId of (m.spouse_ids ?? [])) {
      if ((m.parent_ids ?? []).includes(spouseId)) {
        const parent = byId.get(spouseId)
        const newSpouseIds = (m.spouse_ids ?? []).filter(s => s !== spouseId)
        fixes.push({
          id: 'BUG-1',
          memberId: m.id, memberName: m.name,
          field: 'spouse_ids',
          before: [...m.spouse_ids],
          after: newSpouseIds,
          severity: 'error',
          description:
            `${m.name} has ${parent?.name ?? spouseId} (their PARENT) in spouse_ids. ` +
            `Removing ${parent?.name ?? spouseId} from ${m.name}'s spouse_ids.`,
        })
        getPatch(m.id).spouse_ids = newSpouseIds

        // Also clean up the reverse direction: remove m from parent's spouseIds
        if (parent) {
          const parentCurrentSpouseIds =
            (getPatch(parent.id).spouse_ids as string[] | undefined) ??
            [...(parent.spouse_ids ?? [])]
          if (parentCurrentSpouseIds.includes(m.id)) {
            const newParentSpouseIds = parentCurrentSpouseIds.filter(s => s !== m.id)
            fixes.push({
              id: 'BUG-1b',
              memberId: parent.id, memberName: parent.name,
              field: 'spouse_ids',
              before: [...parentCurrentSpouseIds],
              after: newParentSpouseIds,
              severity: 'error',
              description:
                `${parent.name} lists ${m.name} (their child) as a spouse. ` +
                `Removing ${m.name} from ${parent.name}'s spouse_ids.`,
            })
            getPatch(parent.id).spouse_ids = newParentSpouseIds
          }
        }
      }
    }
  }

  // ── BUG-2: missing bidirectional spouse link between parents ──────────────
  // Find couples who share children but have no spouse link between them
  const parentSets = new Map<string, Set<string>>() // parentId → set of co-parents
  for (const m of rows) {
    if ((m.parent_ids ?? []).length >= 2) {
      for (const p1 of m.parent_ids) {
        for (const p2 of m.parent_ids) {
          if (p1 === p2) continue
          if (!parentSets.has(p1)) parentSets.set(p1, new Set())
          parentSets.get(p1)!.add(p2)
        }
      }
    }
  }
  for (const [p1Id, coParents] of parentSets.entries()) {
    const p1 = byId.get(p1Id); if (!p1) continue
    for (const p2Id of coParents) {
      const p2 = byId.get(p2Id); if (!p2) continue
      // Apply any pending spouseIds patch
      const p1CurrentSpouses = (getPatch(p1Id).spouse_ids as string[] | undefined) ?? [...(p1.spouse_ids ?? [])]
      const p2CurrentSpouses = (getPatch(p2Id).spouse_ids as string[] | undefined) ?? [...(p2.spouse_ids ?? [])]
      if (!p1CurrentSpouses.includes(p2Id)) {
        const newP1Spouses = [...new Set([...p1CurrentSpouses, p2Id])]
        fixes.push({
          id: 'BUG-2a',
          memberId: p1Id, memberName: p1.name,
          field: 'spouse_ids',
          before: [...(p1.spouse_ids ?? [])],
          after: newP1Spouses,
          severity: 'error',
          description:
            `${p1.name} and ${p2.name} share children (co-parents) but ${p1.name} has no spouse link to ${p2.name}. ` +
            `Adding ${p2.name} to ${p1.name}'s spouse_ids.`,
        })
        getPatch(p1Id).spouse_ids = newP1Spouses
      }
      if (!p2CurrentSpouses.includes(p1Id)) {
        const newP2Spouses = [...new Set([...p2CurrentSpouses, p1Id])]
        fixes.push({
          id: 'BUG-2b',
          memberId: p2Id, memberName: p2.name,
          field: 'spouse_ids',
          before: [...(p2.spouse_ids ?? [])],
          after: newP2Spouses,
          severity: 'error',
          description:
            `${p2.name} and ${p1.name} share children (co-parents) but ${p2.name} has no spouse link to ${p1.name}. ` +
            `Adding ${p1.name} to ${p2.name}'s spouse_ids.`,
        })
        getPatch(p2Id).spouse_ids = newP2Spouses
      }
    }
  }

  // ── BUG-3 / 4 / 5 / 6: Disconnected in-law (Shubham-pattern) ────────────
  // A member with relationship="brother" / "sister" / "brother-in-law" etc.
  // that has NO parentIds and NO spouseIds is fully isolated — the graph
  // places them via virtual edges derived from the relationship label.
  // If a same-family member appears to be a placeholder spouse for an isolated member,
  // flag them as a merge candidate.
  //
  // Guard: each placeholder can only be consumed by ONE isolated member.
  const consumedPlaceholders = new Set<string>()

  for (const m of rows) {
    const rel = (m.relationship ?? '').toLowerCase().trim()
    const isolated =
      (m.parent_ids ?? []).length === 0 &&
      (m.spouse_ids ?? []).length === 0
    if (!isolated) continue

    // BUG-3: wrong generation
    // Estimate correct generation: if their relationship label suggests they're
    // a same-generation relative (sibling, sibling-in-law), find the median
    // generation of same-relationship members.
    const sameLevelRels = ['brother', 'sister', 'brother-in-law', 'sister-in-law', 'sibling']
    if (sameLevelRels.includes(rel)) {
      const selfMember = rows.find(r => r.relationship === 'self')
      const expectedGen = selfMember?.generation ?? null
      if (expectedGen !== null && m.generation !== expectedGen) {
        const newGen = expectedGen
        fixes.push({
          id: 'BUG-3',
          memberId: m.id, memberName: m.name,
          field: 'generation',
          before: m.generation,
          after: newGen,
          severity: 'warning',
          description:
            `${m.name} has generation=${m.generation} but their relationship "${rel}" ` +
            `suggests they should be generation=${newGen} (same as self member ${selfMember?.name}).`,
        })
        getPatch(m.id).generation = newGen
      }
    }

    // BUG-4: "brother" label on someone who should be a "brother-in-law"
    // Heuristic: if a member labelled "brother"/"sister" has no parentIds (so they
    // are NOT a confirmed biological child of the same parents) but there is a
    // plausibly matching placeholder spouse of an actual sibling, flag the
    // relationship label as suspicious.
    //
    // For "brother-in-law" specifically — the enrichMembersWithDerivedEdges
    // function uses a different virtual edge path:
    //   "brother"      → virtual parent to self's parent (PL → Shubham, places Shubham under PL)
    //   "brother-in-law" → virtual parent to spouse's parent (Rahul's parent → Shubham)
    //
    // When the user INTENDS the latter but stored the former, the graph is wrong.
    // We detect this if: a sibling of the self member already has a placeholder
    // spouse whose name is similar to this member.

    if (rel === 'brother' || rel === 'sister') {
      // Find actual siblings (members with same parents as self)
      const selfMember = rows.find(r => r.relationship === 'self')
      const selfParentIds = new Set(selfMember?.parent_ids ?? [])
      const actualSiblings = rows.filter(r =>
        r.id !== (selfMember?.id ?? '') &&
        (r.parent_ids ?? []).some(pid => selfParentIds.has(pid)) &&
        r.id !== m.id
      )

      // For each sibling, look at their spouses — any placeholder?
      for (const sib of actualSiblings) {
        for (const spouseId of (sib.spouse_ids ?? [])) {
          // Skip placeholders already consumed by a previous isolated member.
          if (consumedPlaceholders.has(spouseId)) continue

          const sibSpouse = byId.get(spouseId)
          if (!sibSpouse) continue
          const isPlaceholder = sibSpouse.name.toLowerCase().startsWith('mr.') ||
            sibSpouse.name.toLowerCase().startsWith('mrs.') ||
            sibSpouse.name.toLowerCase() === 'unknown' ||
            sibSpouse.name.toLowerCase().includes('shuchi')

          // Additional guard: gender compatibility.
          // "Mr." placeholder → expect male or unspecified member.
          // "Mrs." placeholder → expect female or unspecified member.
          const placeholderIsMale = sibSpouse.name.toLowerCase().startsWith('mr.')
          const placeholderIsFemale = sibSpouse.name.toLowerCase().startsWith('mrs.')
          const memberGender = (m as any).gender ?? null
          if (placeholderIsMale && memberGender === 'female') continue
          if (placeholderIsFemale && memberGender === 'male') continue

          if (isPlaceholder) {
            // Mark this placeholder as consumed so no other isolated member
            // matches it in the same pass.
            consumedPlaceholders.add(spouseId)
            const currentPlaceholderSpouseIds = (getPatch(spouseId).spouse_ids as string[] | undefined) ?? [...(sibSpouse.spouse_ids ?? [])]
            const currentSibSpouseIds = (getPatch(sib.id).spouse_ids as string[] | undefined) ?? [...(sib.spouse_ids ?? [])]
            const newSibSpouseIds = [...new Set([
              ...currentSibSpouseIds.filter(s => s !== spouseId),
              m.id,
            ])]
            const newMemberSpouseIds = [...new Set([...(m.spouse_ids ?? []), sib.id])]

            fixes.push({
              id: 'BUG-4',
              memberId: m.id, memberName: m.name,
              field: 'relationship',
              before: m.relationship,
              after: 'brother-in-law',
              severity: 'error',
              description:
                `${m.name} is labelled "${m.relationship}" but has no biological parents in this tree. ` +
                `${sib.name} has a placeholder spouse "${sibSpouse.name}" — likely a placeholder for ${m.name}. ` +
                `Correcting ${m.name}'s relationship to "brother-in-law".`,
            })
            getPatch(m.id).relationship = 'brother-in-law'

            fixes.push({
              id: 'BUG-5',
              memberId: m.id, memberName: m.name,
              field: 'spouse_ids',
              before: [],
              after: newMemberSpouseIds,
              severity: 'error',
              description:
                `${m.name} has no spouse link. Wiring ${m.name} ↔ ${sib.name} as spouses.`,
            })
            getPatch(m.id).spouse_ids = newMemberSpouseIds

            fixes.push({
              id: 'BUG-5b',
              memberId: sib.id, memberName: sib.name,
              field: 'spouse_ids',
              before: [...(sib.spouse_ids ?? [])],
              after: newSibSpouseIds,
              severity: 'error',
              description:
                `Replacing placeholder spouse "${sibSpouse.name}" in ${sib.name}'s spouse_ids with real person ${m.name}.`,
            })
            getPatch(sib.id).spouse_ids = newSibSpouseIds

            // BUG-6: soft-delete the placeholder
            fixes.push({
              id: 'BUG-6',
              memberId: spouseId, memberName: sibSpouse.name,
              field: 'deleted_at',
              before: null,
              after: new Date().toISOString(),
              severity: 'warning',
              description:
                `Soft-deleting placeholder member "${sibSpouse.name}" (${spouseId}) — replaced by real person ${m.name}.`,
            })
            // Mark for soft-delete
            patches.push({ id: spouseId, patch: {}, softDelete: true })
          }
        }
      }
    }
  }

  // Convert patchMap → patches array
  for (const [id, patch] of patchMap.entries()) {
    if (Object.keys(patch).length > 0) {
      const existing = patches.find(p => p.id === id)
      if (existing) Object.assign(existing.patch, patch)
      else patches.push({ id, patch })
    }
  }

  return { fixes, patches }
}

// ─── Apply patches to DB ──────────────────────────────────────────────────────

async function applyPatches(patches: DBPatch[], rows: DBMember[]): Promise<void> {
  const now = new Date().toISOString()
  for (const { id, patch, softDelete } of patches) {
    const m = rows.find(r => r.id === id)
    if (!m) { console.error('  ⚠ member not found:', id); continue }

    if (softDelete) {
      const { error } = await (admin as any)
        .from('family_members')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', id)
      if (error) console.error(`  ✗ soft-delete failed for ${m.name}:`, error.message)
      else console.log(`  ✓ soft-deleted placeholder "${m.name}"`)
      continue
    }

    if (Object.keys(patch).length === 0) continue
    const { error } = await (admin as any)
      .from('family_members')
      .update({ ...patch, updated_at: now })
      .eq('id', id)
      .is('deleted_at', null)
    if (error) console.error(`  ✗ patch failed for ${m.name}:`, error.message)
    else console.log(`  ✓ patched ${m.name}: ${Object.keys(patch).join(', ')}`)
  }
}

// ─── Build graph snapshot ─────────────────────────────────────────────────────

function buildGraphSnapshot(rows: DBMember[], label: 'BEFORE' | 'AFTER', patches: DBPatch[]): object[] {
  const patchMap = new Map(patches.filter(p => !p.softDelete).map(p => [p.id, p.patch]))
  const softDeletedIds = new Set(patches.filter(p => p.softDelete).map(p => p.id))

  return rows
    .filter(r => label === 'BEFORE' || !softDeletedIds.has(r.id))
    .map(r => {
      if (label === 'BEFORE') {
        return {
          id: r.id, name: r.name, relationship: r.relationship,
          generation: r.generation, parentIds: r.parent_ids ?? [], spouseIds: r.spouse_ids ?? [],
          status: softDeletedIds.has(r.id) ? 'will_be_deleted' : 'active',
        }
      }
      const p = patchMap.get(r.id) ?? {}
      return {
        id: r.id, name: r.name,
        relationship: (p.relationship as string | undefined) ?? r.relationship,
        generation: (p.generation as number | undefined) ?? r.generation,
        parentIds: (p.parent_ids as string[] | undefined) ?? (r.parent_ids ?? []),
        spouseIds: (p.spouse_ids as string[] | undefined) ?? (r.spouse_ids ?? []),
        status: 'active',
      }
    })
}

// ─── Format integrity report ──────────────────────────────────────────────────

function printReport(rows: DBMember[], fixes: FixOp[]): void {
  const byId = new Map(rows.map(r => [r.id, r.name]))
  const hr = (c = '─', n = 60) => c.repeat(n)

  console.log('\n' + hr('═'))
  console.log('  FAMILY GRAPH INTEGRITY REPORT')
  console.log(`  Family: ${FAMILY_ID}`)
  console.log(`  Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`)
  console.log(hr('═'))
  console.log()

  if (fixes.length === 0) {
    console.log('  ✔ No integrity issues found.')
    return
  }

  const errorFixes = fixes.filter(f => f.severity === 'error')
  const warnFixes = fixes.filter(f => f.severity === 'warning')

  console.log(`  ${errorFixes.length} errors, ${warnFixes.length} warnings\n`)

  for (const fix of fixes) {
    const tag = fix.severity === 'error' ? '🔴 ERROR FIXED' : '⚠️  WARNING'
    console.log(`${tag}: [${fix.id}] ${fix.memberName}`)
    console.log()
    console.log(`  ${fix.description}`)
    console.log()
    console.log('  Before:')
    if (Array.isArray(fix.before)) {
      const names = (fix.before as string[]).map(id => byId.get(id) ?? id)
      console.log(`    ${fix.field}: [${names.join(', ')}]`)
    } else {
      console.log(`    ${fix.field}: ${JSON.stringify(fix.before)}`)
    }
    console.log()
    console.log('  After:')
    if (Array.isArray(fix.after)) {
      const names = (fix.after as string[]).map(id => byId.get(id) ?? id)
      console.log(`    ${fix.field}: [${names.join(', ')}]`)
    } else {
      console.log(`    ${fix.field}: ${JSON.stringify(fix.after)}`)
    }
    console.log()
    console.log(hr())
  }
}

// ─── Verify expected graph ────────────────────────────────────────────────────

function printExpectedGraph(rows: DBMember[], patches: DBPatch[]): void {
  const pMap = new Map(patches.filter(p => !p.softDelete).map(p => [p.id, p.patch]))
  const softDeleted = new Set(patches.filter(p => p.softDelete).map(p => p.id))
  const byId = new Map(rows.map(r => [r.id, r]))
  const nameOf = (id: string) => byId.get(id)?.name ?? id

  // Build after-state
  const afterRows = rows
    .filter(r => !softDeleted.has(r.id))
    .map(r => {
      const p = pMap.get(r.id) ?? {}
      return {
        ...r,
        relationship: (p.relationship as string | undefined) ?? r.relationship,
        generation: (p.generation as number | undefined) ?? r.generation,
        parent_ids: (p.parent_ids as string[] | undefined) ?? r.parent_ids ?? [],
        spouse_ids: (p.spouse_ids as string[] | undefined) ?? r.spouse_ids ?? [],
      }
    })

  const selfMember = afterRows.find(r => r.relationship === 'self')
  if (!selfMember) { console.log('  (no self member — cannot render expected graph)'); return }

  console.log('\n  ─── Expected graph after fix ────────────────────────────')
  console.log('  (structural edges only — no virtual enrichment)')
  console.log()

  // Parents of self
  const selfParents = selfMember.parent_ids.map(id => afterRows.find(r => r.id === id)).filter(Boolean) as typeof afterRows
  const selfSpouses = selfMember.spouse_ids.map(id => afterRows.find(r => r.id === id)).filter(Boolean) as typeof afterRows

  if (selfParents.length > 0) {
    const parentLine = selfParents.map(p => {
      const pSpouses = p.spouse_ids.map(id => afterRows.find(r => r.id === id)?.name ?? id).filter(n => n !== selfMember.name)
      return pSpouses.length > 0 ? `${p.name} ──── ${pSpouses.join(' / ')}` : p.name
    }).join('       ')
    console.log(`  ${parentLine}`)
    console.log('       |')
  }

  const selfLine = [selfMember.name, ...selfSpouses.map(s => s.name)].join(' ════ ')
  console.log(`  ${selfLine}`)

  // Siblings of self
  const selfParentSet = new Set(selfMember.parent_ids)
  const siblings = afterRows.filter(r =>
    r.id !== selfMember.id &&
    r.parent_ids.some(pid => selfParentSet.has(pid))
  )
  if (siblings.length > 0) {
    for (const sib of siblings) {
      const sibSpouses = sib.spouse_ids.map(id => afterRows.find(r => r.id === id)).filter(Boolean) as typeof afterRows
      const line = sibSpouses.length > 0
        ? `  ${sib.name} (${sib.relationship ?? 'sibling'}) ════ ${sibSpouses.map(s => s.name).join(', ')}`
        : `  ${sib.name} (${sib.relationship ?? 'sibling'})`
      console.log(line)
    }
  }

  // Spouse's parents
  for (const sp of selfSpouses) {
    const spParents = sp.parent_ids.map(id => afterRows.find(r => r.id === id)).filter(Boolean) as typeof afterRows
    if (spParents.length > 0) {
      const ppLine = spParents.map(p => {
        const ppSpouses = p.spouse_ids.map(id => afterRows.find(r => r.id === id)?.name ?? id).filter(n => n !== sp.name)
        return ppSpouses.length > 0 ? `${p.name} ──── ${ppSpouses.join(' / ')}` : p.name
      }).join('       ')
      console.log(`\n  ${sp.name}'s parents: ${ppLine}`)
      const spSiblings = afterRows.filter(r =>
        r.id !== sp.id && sp.parent_ids.every(pid => r.parent_ids.includes(pid) || sp.parent_ids.length === 0) &&
        r.parent_ids.some(pid => sp.parent_ids.includes(pid))
      )
      for (const sib of spSiblings) {
        const sibSpouses = sib.spouse_ids.map(id => afterRows.find(r => r.id === id)).filter(Boolean) as typeof afterRows
        const line = sibSpouses.length > 0
          ? `  ${sp.name}'s sibling: ${sib.name} (${sib.relationship ?? '?'}) ════ ${sibSpouses.map(s => s.name).join(', ')}`
          : `  ${sp.name}'s sibling: ${sib.name} (${sib.relationship ?? '?'})`
        console.log(line)
      }
    }
  }
  console.log()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log(EXECUTE
    ? '  FAMILY GRAPH FIX — EXECUTE'
    : '  FAMILY GRAPH FIX — DRY-RUN (no DB writes)')
  console.log('  Family: ' + FAMILY_ID)
  console.log('═'.repeat(60))

  const rows = await fetchMembers()
  console.log(`\n  Members loaded: ${rows.length}`)

  const { fixes, patches } = detectBugs(rows)

  // Print report
  printReport(rows, fixes)

  // Before snapshot
  const before = buildGraphSnapshot(rows, 'BEFORE', patches)
  const after = buildGraphSnapshot(rows, 'AFTER', patches)

  // Show expected graph
  printExpectedGraph(rows, patches)

  // Execute
  if (EXECUTE && patches.length > 0) {
    console.log('\n  Applying patches…')
    await applyPatches(patches, rows)
    console.log('\n  ✔ Done.')
  } else if (!EXECUTE && patches.length > 0) {
    console.log(`  (${patches.length} patches pending — run with --execute to apply)`)
  } else {
    console.log('\n  ✔ No patches needed.')
  }

  // Write JSON report
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outFile = resolve(
    process.cwd(),
    `FAMILY_GRAPH_INTEGRITY_REPORT_${EXECUTE ? 'EXECUTED' : 'DRYRUN'}_${ts}.json`,
  )
  writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: EXECUTE ? 'execute' : 'dry-run',
    familyId: FAMILY_ID,
    memberCount: rows.length,
    bugsFound: fixes.length,
    patchesGenerated: patches.length,
    fixes,
    graphDiff: {
      before,
      after,
      changed: before
        .map(b => {
          const a = after.find((a: any) => a.id === (b as any).id)
          if (!a) return { id: (b as any).id, name: (b as any).name, change: 'soft_deleted' }
          const changes: Record<string, { before: unknown; after: unknown }> = {}
          for (const k of ['relationship', 'generation', 'parentIds', 'spouseIds'] as const) {
            if (JSON.stringify((b as any)[k]) !== JSON.stringify((a as any)[k])) {
              changes[k] = { before: (b as any)[k], after: (a as any)[k] }
            }
          }
          return Object.keys(changes).length > 0
            ? { id: (b as any).id, name: (b as any).name, change: 'updated', ...changes }
            : null
        })
        .filter(Boolean),
    },
  }, null, 2))
  console.log(`\n  Report: ${outFile}`)
  console.log('═'.repeat(60) + '\n')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
