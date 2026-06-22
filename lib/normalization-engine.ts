/**
 * Family Tree Data Normalization Engine
 *
 * Detects and fixes relationship inconsistencies across the family graph.
 * Rules implemented:
 *  1.  Duplicate member-ID check
 *  2.  Self-parent / self-spouse / duplicate IDs in arrays
 *  2b. Too-many-parents (> 2 biological parents)
 *  3.  Dangling references (parentId / spouseId → deleted/missing node)
 *  4.  Spouse bidirectionality
 *  5.  Spouse-as-parent (P is both parent and spouse of same person)
 *  5b. Child-as-spouse (A listed as spouse of B, but B lists A as a parent)
 *  6.  maritalStatus coherence
 *  6b. Spouse generation mismatch (> 2 generations apart)
 *  7.  Parent → generation ordering (parent gen < child gen)
 *  7b. Birth year validity (parent born before child, min/max age gap)
 *  8.  Sibling-as-parent conflict
 *  9.  Circular reference detection (DFS)
 *  10. Generation recalculation (BFS from roots)
 *  11. Duplicate member detection (name + structural signals)
 *  12. Missing second parent / spouse suggestions
 *  13. In-law-as-child structural type confusion
 *  13b. Cross-cluster conflicting parentage (generic)
 *  14. Orphan node detection (no parents, no spouses, no children)
 */

import { FamilyMember } from './types'

// ── Output types ──────────────────────────────────────────────────────────────

export interface NormIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  type: string
  affectedIds: string[]
  description: string
}

export interface NormFix {
  memberId: string
  memberName: string
  issue: string
  old_value: unknown
  new_value: unknown
  confidence_score: number
}

export interface NormSuggestion {
  type: string
  affectedIds: string[]
  description: string
}

export interface NormalizationResult {
  cleaned_members: FamilyMember[]
  issues_found: NormIssue[]
  fixes_applied: NormFix[]
  suggestions: NormSuggestion[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Levenshtein distance for fuzzy name matching */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/** Normalise a name for comparison (lowercase, collapse spaces) */
function normName(name: string) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Name-similarity score 0–1 (1 = identical) */
function nameSimilarity(a: string, b: string): number {
  const na = normName(a)
  const nb = normName(b)
  if (na === nb) return 1
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(na, nb) / maxLen
}

/** Array intersection */
function intersect<T>(a: T[], b: T[]): T[] {
  const set = new Set(b)
  return a.filter(x => set.has(x))
}

/** Deduplicate an array, preserving order */
function dedup<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum years between parent's birth and child's birth */
const MIN_PARENT_CHILD_YEARS = 12
/** Years gap > this triggers a birth_year_gap warning (not hard error) */
const MAX_PARENT_CHILD_YEARS = 80
/** Spouse generation difference > this is flagged as suspicious */
const SPOUSE_GEN_TOLERANCE = 2

// ── Main engine ───────────────────────────────────────────────────────────────

export function normalizeFamilyTree(members: FamilyMember[]): NormalizationResult {
  // Deep-clone so we never mutate the source
  const cleaned: FamilyMember[] = members.map(m => ({
    ...m,
    parentIds: [...(m.parentIds ?? [])],
    spouseIds: [...(m.spouseIds ?? [])],
  }))

  const byId = new Map<string, FamilyMember>(cleaned.map(m => [m.id, m]))
  const issues: NormIssue[] = []
  const fixes: NormFix[] = []
  const suggestions: NormSuggestion[] = []
  let issueSeq = 1
  const issId = () => `NRM-${String(issueSeq++).padStart(3, '0')}`

  // ── 1. Duplicate ID check ────────────────────────────────────────────────

  const seenIds = new Set<string>()
  const dupIds: string[] = []
  for (const m of cleaned) {
    if (seenIds.has(m.id)) dupIds.push(m.id)
    else seenIds.add(m.id)
  }
  if (dupIds.length > 0) {
    issues.push({
      id: issId(),
      severity: 'error',
      type: 'duplicate_member_id',
      affectedIds: dupIds,
      description: `Duplicate member IDs found: ${dupIds.join(', ')}. Each member must have a unique ID.`,
    })
  }

  // ── 2. Self-parent / self-spouse / circular parentId / spouseId dedup ────

  for (const m of cleaned) {
    // Self-parent
    if (m.parentIds.includes(m.id)) {
      issues.push({
        id: issId(),
        severity: 'error',
        type: 'self_parent',
        affectedIds: [m.id],
        description: `${m.name} (${m.id}) lists itself as a parent.`,
      })
      const old = [...m.parentIds]
      m.parentIds = m.parentIds.filter(pid => pid !== m.id)
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'self_parent',
        old_value: old,
        new_value: m.parentIds,
        confidence_score: 100,
      })
    }

    // Self-spouse
    if (m.spouseIds.includes(m.id)) {
      issues.push({
        id: issId(),
        severity: 'error',
        type: 'self_spouse',
        affectedIds: [m.id],
        description: `${m.name} (${m.id}) lists itself as a spouse.`,
      })
      const old = [...m.spouseIds]
      m.spouseIds = m.spouseIds.filter(sid => sid !== m.id)
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'self_spouse',
        old_value: old,
        new_value: m.spouseIds,
        confidence_score: 100,
      })
    }

    // Duplicate parentIds
    const dedupedParents = dedup(m.parentIds)
    if (dedupedParents.length !== m.parentIds.length) {
      const old = [...m.parentIds]
      m.parentIds = dedupedParents
      issues.push({
        id: issId(),
        severity: 'warning',
        type: 'duplicate_parent_id',
        affectedIds: [m.id],
        description: `${m.name} (${m.id}) has duplicate entries in parentIds.`,
      })
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'duplicate_parent_id',
        old_value: old,
        new_value: m.parentIds,
        confidence_score: 100,
      })
    }

    // Duplicate spouseIds
    const dedupedSpouses = dedup(m.spouseIds)
    if (dedupedSpouses.length !== m.spouseIds.length) {
      const old = [...m.spouseIds]
      m.spouseIds = dedupedSpouses
      issues.push({
        id: issId(),
        severity: 'warning',
        type: 'duplicate_spouse_id',
        affectedIds: [m.id],
        description: `${m.name} (${m.id}) has duplicate entries in spouseIds.`,
      })
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'duplicate_spouse_id',
        old_value: old,
        new_value: m.spouseIds,
        confidence_score: 100,
      })
    }
  }

  // ── 2b. Too many parents (> 2) ───────────────────────────────────────────
  // A person can have at most 2 biological parents. More than 2 is a data error
  // (often caused by accidentally adding a step-parent or in-law as a parent).
  // Auto-fix: trim to first 2 parents (low confidence — user must verify).

  for (const m of cleaned) {
    if (m.parentIds.length > 2) {
      issues.push({
        id: issId(),
        severity: 'error',
        type: 'too_many_parents',
        affectedIds: [m.id, ...m.parentIds],
        description:
          `${m.name} (${m.id}) has ${m.parentIds.length} parents listed. ` +
          `A person can have at most 2 biological parents. ` +
          `Additional parents may be step-parents or in-laws that should be connected via a different relationship type.`,
      })
      const old = [...m.parentIds]
      m.parentIds = m.parentIds.slice(0, 2)
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'too_many_parents — trimmed to first 2 (verify step-parents separately)',
        old_value: old,
        new_value: m.parentIds,
        confidence_score: 60,
      })
    }
  }

  // ── 3. Dangling references (parentId / spouseId points to non-existent ID) ─

  for (const m of cleaned) {
    const badParents = m.parentIds.filter(pid => !byId.has(pid))
    if (badParents.length > 0) {
      issues.push({
        id: issId(),
        severity: 'error',
        type: 'dangling_parent_ref',
        affectedIds: [m.id, ...badParents],
        description: `${m.name} (${m.id}) references non-existent parent IDs: ${badParents.join(', ')}.`,
      })
      const old = [...m.parentIds]
      m.parentIds = m.parentIds.filter(pid => byId.has(pid))
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'dangling_parent_ref',
        old_value: old,
        new_value: m.parentIds,
        confidence_score: 95,
      })
    }

    const badSpouses = m.spouseIds.filter(sid => !byId.has(sid))
    if (badSpouses.length > 0) {
      issues.push({
        id: issId(),
        severity: 'error',
        type: 'dangling_spouse_ref',
        affectedIds: [m.id, ...badSpouses],
        description: `${m.name} (${m.id}) references non-existent spouse IDs: ${badSpouses.join(', ')}.`,
      })
      const old = [...m.spouseIds]
      m.spouseIds = m.spouseIds.filter(sid => byId.has(sid))
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'dangling_spouse_ref',
        old_value: old,
        new_value: m.spouseIds,
        confidence_score: 95,
      })
    }
  }

  // Re-sync byId after possible changes above
  for (const m of cleaned) byId.set(m.id, m)

  // ── 4. Spouse bidirectionality ───────────────────────────────────────────

  for (const m of cleaned) {
    for (const sid of m.spouseIds) {
      const spouse = byId.get(sid)
      if (!spouse) continue
      if (!spouse.spouseIds.includes(m.id)) {
        issues.push({
          id: issId(),
          severity: 'error',
          type: 'unidirectional_spouse',
          affectedIds: [m.id, sid],
          description: `${m.name} (${m.id}) lists ${spouse.name} (${sid}) as spouse, but the link is not reciprocated.`,
        })
        const old = [...spouse.spouseIds]
        spouse.spouseIds = dedup([...spouse.spouseIds, m.id])
        fixes.push({
          memberId: spouse.id,
          memberName: spouse.name,
          issue: 'unidirectional_spouse — added missing back-reference',
          old_value: old,
          new_value: spouse.spouseIds,
          confidence_score: 98,
        })
      }
    }
  }

  // ── 5. Spouse-as-parent check ────────────────────────────────────────────
  // If A.spouseIds contains P AND A.parentIds also contains P, P is both a
  // parent AND a spouse — an impossible structural contradiction.
  // Auto-fix: remove P from spouseIds. The parentIds entry is more likely
  // correct because parents are typically added before spouses.

  for (const m of cleaned) {
    for (const sid of m.spouseIds) {
      if (m.parentIds.includes(sid)) {
        const parentName = byId.get(sid)?.name ?? sid
        issues.push({
          id: issId(),
          severity: 'error',
          type: 'spouse_is_parent',
          affectedIds: [m.id, sid],
          description:
            `${m.name} (${m.id}) lists ${parentName} (${sid}) as both a parent AND a spouse. ` +
            `Auto-removing ${parentName} from spouseIds — a parent cannot also be a spouse.`,
        })
        const oldSpouses = [...m.spouseIds]
        m.spouseIds = m.spouseIds.filter(s => s !== sid)
        fixes.push({
          memberId: m.id,
          memberName: m.name,
          issue: 'spouse_is_parent — removed parent from spouseIds',
          old_value: oldSpouses,
          new_value: m.spouseIds,
          confidence_score: 100,
        })
      }
    }
  }

  // ── 5b. Child-as-spouse check ────────────────────────────────────────────
  // If A.spouseIds includes B AND B.parentIds includes A:
  // A is listed as a spouse of B, but B treats A as a parent — structurally impossible.
  // This is the inverse of rule 5: caught when iterating from the spouse's perspective.
  // Fix: remove A from B.parentIds (the spouse link is the correct relationship).

  for (const m of cleaned) {
    for (const sid of m.spouseIds) {
      const spouse = byId.get(sid)
      if (!spouse) continue
      if (spouse.parentIds.includes(m.id)) {
        issues.push({
          id: issId(),
          severity: 'error',
          type: 'child_as_spouse',
          affectedIds: [m.id, sid],
          description:
            `${m.name} (${m.id}) is listed as a spouse of ${spouse.name} (${sid}), ` +
            `but ${spouse.name} also lists ${m.name} as a parent — a parent cannot also be a spouse. ` +
            `Removing ${m.name} from ${spouse.name}'s parentIds.`,
        })
        const old = [...spouse.parentIds]
        spouse.parentIds = spouse.parentIds.filter(pid => pid !== m.id)
        fixes.push({
          memberId: spouse.id,
          memberName: spouse.name,
          issue: 'child_as_spouse — removed spouse from parentIds',
          old_value: old,
          new_value: spouse.parentIds,
          confidence_score: 95,
        })
      }
    }
  }

  // ── 6. maritalStatus coherence ───────────────────────────────────────────
  // If a member has spouseIds and maritalStatus is 'never_married', correct it
  // to 'married' — the DB constraint (migration 044) blocks 'never_married' with
  // active spouse links.

  for (const m of cleaned) {
    if (m.spouseIds.length > 0 && m.maritalStatus === 'never_married') {
      issues.push({
        id: issId(),
        severity: 'warning',
        type: 'marital_status_contradiction',
        affectedIds: [m.id],
        description: `${m.name} (${m.id}) has spouseIds but maritalStatus is 'never_married'. Corrected to 'married'.`,
      })
      const old = m.maritalStatus
      m.maritalStatus = 'married'
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'marital_status_contradiction',
        old_value: old,
        new_value: 'married',
        confidence_score: 95,
      })
    }
  }

  // ── 6b. Spouse generation mismatch ──────────────────────────────────────
  // Two spouses more than SPOUSE_GEN_TOLERANCE generations apart is structurally
  // implausible and usually indicates a parent/child edge that was accidentally
  // entered as a spouse edge. Flagged as warning (rare legitimate cases: very
  // large age gaps in historical records). Only emit once per pair.

  const spouseGenPairsChecked = new Set<string>()

  for (const m of cleaned) {
    for (const sid of m.spouseIds) {
      const spouse = byId.get(sid)
      if (!spouse) continue
      const pairKey = [m.id, sid].sort().join('|')
      if (spouseGenPairsChecked.has(pairKey)) continue
      spouseGenPairsChecked.add(pairKey)

      const genDiff = Math.abs(m.generation - spouse.generation)
      if (genDiff > SPOUSE_GEN_TOLERANCE) {
        issues.push({
          id: issId(),
          severity: 'warning',
          type: 'spouse_generation_mismatch',
          affectedIds: [m.id, sid],
          description:
            `${m.name} (gen ${m.generation}) and ${spouse.name} (gen ${spouse.generation}) ` +
            `are listed as spouses but are ${genDiff} generation(s) apart. ` +
            `This may indicate a data-entry error where a parent/child edge was recorded as a spouse. ` +
            `Please verify this is correct before dismissing.`,
        })
      }
    }
  }

  // ── 7. Parent → generation ordering ─────────────────────────────────────
  // A parent must be in a strictly lower generation than the child.

  for (const m of cleaned) {
    for (const pid of m.parentIds) {
      const parent = byId.get(pid)
      if (!parent) continue
      if (parent.generation >= m.generation) {
        issues.push({
          id: issId(),
          severity: 'warning',
          type: 'generation_mismatch',
          affectedIds: [m.id, pid],
          description: `${m.name} (gen ${m.generation}) has parent ${parent.name} (gen ${parent.generation}). A parent must be in a lower generation than the child.`,
        })
        // Flag only — generation recalculation pass below will handle this
      }
    }
  }

  // ── 7b. Birth year validity — parent-child order ─────────────────────────
  // Validates the biological plausibility of parent-child birth years:
  //   • Parent born AFTER child: impossible
  //   • Age gap < MIN_PARENT_CHILD_YEARS: biologically impossible
  //   • Age gap > MAX_PARENT_CHILD_YEARS: warning (unusual but possible in history)

  for (const m of cleaned) {
    for (const pid of m.parentIds) {
      const parent = byId.get(pid)
      if (!parent?.birthYear || !m.birthYear) continue
      const ageDiff = m.birthYear - parent.birthYear
      if (ageDiff < 0) {
        issues.push({
          id: issId(),
          severity: 'error',
          type: 'birth_year_impossible',
          affectedIds: [m.id, pid],
          description:
            `${parent.name} (b.${parent.birthYear}) is listed as a parent of ` +
            `${m.name} (b.${m.birthYear}), but was born AFTER the child — impossible. ` +
            `Verify whether this is a parent-child edge or the birth years are swapped.`,
        })
      } else if (ageDiff < MIN_PARENT_CHILD_YEARS) {
        issues.push({
          id: issId(),
          severity: 'error',
          type: 'birth_year_impossible',
          affectedIds: [m.id, pid],
          description:
            `${parent.name} (b.${parent.birthYear}) is listed as a parent of ` +
            `${m.name} (b.${m.birthYear}), only ${ageDiff} year(s) older — biologically impossible (minimum ${MIN_PARENT_CHILD_YEARS} years required). ` +
            `Check whether these should be siblings instead.`,
        })
      } else if (ageDiff > MAX_PARENT_CHILD_YEARS) {
        issues.push({
          id: issId(),
          severity: 'warning',
          type: 'birth_year_gap',
          affectedIds: [m.id, pid],
          description:
            `${parent.name} (b.${parent.birthYear}) is listed as a parent of ` +
            `${m.name} (b.${m.birthYear}), ${ageDiff} years older — unusually large age gap. ` +
            `Verify this relationship is correct (possible grandparent-as-parent data entry error).`,
        })
      }
    }
  }

  // ── 8. Sibling-as-parent check ───────────────────────────────────────────
  // If A and B share the same parents, they cannot also have a parent-child relationship.

  for (const m of cleaned) {
    for (const pid of m.parentIds) {
      const potentialParent = byId.get(pid)
      if (!potentialParent) continue
      // Check if they share at least one parent (i.e., are siblings)
      const shared = intersect(m.parentIds.filter(x => x !== pid), potentialParent.parentIds)
      if (shared.length > 0) {
        issues.push({
          id: issId(),
          severity: 'error',
          type: 'sibling_as_parent',
          affectedIds: [m.id, pid],
          description: `${m.name} (${m.id}) and ${potentialParent.name} (${pid}) share common parents [${shared.join(', ')}], yet ${potentialParent.name} is also listed as ${m.name}'s parent. Possible sibling-as-parent error.`,
        })
      }
    }
  }

  // ── 9. Circular reference detection (DFS) ───────────────────────────────

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const cycleDetected = new Set<string>()

  function dfsParent(id: string, path: string[]): void {
    if (visiting.has(id)) {
      // Cycle
      const cycleStart = path.indexOf(id)
      const cycle = path.slice(cycleStart)
      if (!cycleDetected.has(cycle.sort().join(','))) {
        cycleDetected.add(cycle.sort().join(','))
        issues.push({
          id: issId(),
          severity: 'error',
          type: 'cycle_detected',
          affectedIds: cycle,
          description: `Circular parent reference detected: ${cycle.map(cid => byId.get(cid)?.name ?? cid).join(' → ')} → ${byId.get(id)?.name ?? id}`,
        })
      }
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    const m = byId.get(id)
    if (m) {
      for (const pid of m.parentIds) {
        dfsParent(pid, [...path, id])
      }
    }
    visiting.delete(id)
    visited.add(id)
  }

  for (const m of cleaned) {
    if (!visited.has(m.id)) dfsParent(m.id, [])
  }

  // ── 10. Generation recalculation (BFS from roots) ───────────────────────
  // Root = member with no parents.

  const computedGen = new Map<string, number>()
  const roots = cleaned.filter(m => m.parentIds.length === 0)

  // BFS using parent→children adjacency
  const children = new Map<string, string[]>()
  for (const m of cleaned) children.set(m.id, [])
  for (const m of cleaned) {
    for (const pid of m.parentIds) {
      if (!children.has(pid)) children.set(pid, [])
      children.get(pid)!.push(m.id)
    }
  }

  // For affiliated/extended subgraphs, roots may have explicit generation != 0.
  // We recalculate relative to each root's declared generation.
  const queue: Array<{ id: string; gen: number }> = []
  for (const r of roots) {
    queue.push({ id: r.id, gen: r.generation })
    computedGen.set(r.id, r.generation)
  }

  // visitedBfs prevents re-queuing nodes with two parents (diamond graphs) from causing O(V+E²) work.
  const visitedBfs = new Set<string>(roots.map(r => r.id))

  while (queue.length > 0) {
    const { id, gen } = queue.shift()!
    for (const cid of children.get(id) ?? []) {
      const existing = computedGen.get(cid)
      const expected = gen + 1
      if (existing === undefined) {
        computedGen.set(cid, expected)
        if (!visitedBfs.has(cid)) {
          visitedBfs.add(cid)
          queue.push({ id: cid, gen: expected })
        }
      } else if (existing !== expected) {
        const resolved = Math.max(existing, expected)
        if (resolved !== existing) {
          computedGen.set(cid, resolved)
          if (!visitedBfs.has(cid)) {
            visitedBfs.add(cid)
            queue.push({ id: cid, gen: resolved })
          }
        }
      }
    }
  }

  // Apply computed generations and report mismatches
  for (const m of cleaned) {
    const computed = computedGen.get(m.id)
    if (computed !== undefined && computed !== m.generation) {
      issues.push({
        id: issId(),
        severity: 'warning',
        type: 'generation_mismatch',
        affectedIds: [m.id],
        description: `${m.name} (${m.id}) has generation=${m.generation} but computed generation from parents is ${computed}.`,
      })
      fixes.push({
        memberId: m.id,
        memberName: m.name,
        issue: 'generation_value_corrected',
        old_value: m.generation,
        new_value: computed,
        confidence_score: 90,
      })
      m.generation = computed
    }
  }

  // ── 11. Duplicate member detection ──────────────────────────────────────
  // Criteria: high name similarity AND (same parents OR same spouse OR birth-year within 2)

  const mergeChecked = new Set<string>()

  for (let i = 0; i < cleaned.length; i++) {
    for (let j = i + 1; j < cleaned.length; j++) {
      const a = cleaned[i]
      const b = cleaned[j]
      const key = [a.id, b.id].sort().join('|')
      if (mergeChecked.has(key)) continue
      mergeChecked.add(key)

      const nameSim = nameSimilarity(a.name, b.name)
      if (nameSim < 0.80) continue // not similar enough

      const sameParents = intersect(a.parentIds, b.parentIds).length > 0
      const sameSpouse =
        a.spouseIds.some(s => b.spouseIds.includes(s)) ||
        a.spouseIds.includes(b.id) ||
        b.spouseIds.includes(a.id)
      const birthYearClose =
        a.birthYear !== undefined &&
        b.birthYear !== undefined &&
        Math.abs(a.birthYear - b.birthYear) <= 2

      const matchReasons: string[] = []
      if (nameSim >= 0.80) matchReasons.push(`name similarity ${(nameSim * 100).toFixed(0)}%`)
      if (sameParents) matchReasons.push('shared parent(s)')
      if (sameSpouse) matchReasons.push('same or shared spouse')
      if (birthYearClose) matchReasons.push(`birth years within 2 (${a.birthYear} vs ${b.birthYear})`)

      // Require at least name similarity + one structural signal for a high-confidence duplicate flag
      const structuralSignals = [sameParents, sameSpouse, birthYearClose].filter(Boolean).length
      if (structuralSignals === 0) continue

      const confidence = Math.round(
        nameSim * 50 + (sameParents ? 20 : 0) + (sameSpouse ? 20 : 0) + (birthYearClose ? 10 : 0)
      )

      // Same-name, same-family: check if it's just a name collision (different branches, different birth year)
      const isDefinitelyDifferentPeople =
        !sameParents &&
        !sameSpouse &&
        a.birthYear !== undefined &&
        b.birthYear !== undefined &&
        Math.abs(a.birthYear - b.birthYear) > 3

      if (isDefinitelyDifferentPeople) {
        issues.push({
          id: issId(),
          severity: 'info',
          type: 'name_collision',
          affectedIds: [a.id, b.id],
          description: `"${a.name}" (${a.id}, b.${a.birthYear}) and "${b.name}" (${b.id}, b.${b.birthYear}) share a similar name but are confirmed different people (different parents, different birth years). No merge needed.`,
        })
        continue
      }

      issues.push({
        id: issId(),
        severity: confidence >= 75 ? 'error' : 'warning',
        type: 'duplicate_identity',
        affectedIds: [a.id, b.id],
        description:
          `Potential duplicate: "${a.name}" (${a.id}) and "${b.name}" (${b.id}). ` +
          `Match reasons: ${matchReasons.join('; ')}. Confidence: ${confidence}%. ` +
          `Manual review required before merging.`,
      })
    }
  }

  // ── 12. Missing second parent suggestions ───────────────────────────────
  // If a child has exactly one parent, check if that parent has a known spouse.

  for (const m of cleaned) {
    if (m.parentIds.length === 1) {
      const knownParent = byId.get(m.parentIds[0])
      if (knownParent && knownParent.spouseIds.length > 0) {
        const spouseNames = knownParent.spouseIds
          .map(sid => byId.get(sid)?.name ?? sid)
          .join(', ')
        suggestions.push({
          type: 'missing_second_parent',
          affectedIds: [m.id, knownParent.id, ...knownParent.spouseIds],
          description:
            `${m.name} (${m.id}) has only one recorded parent: ${knownParent.name} (${knownParent.id}). ` +
            `${knownParent.name} has a known spouse (${spouseNames}). ` +
            `Consider adding the spouse as the second parent if biologically appropriate.`,
        })
      } else if (knownParent && knownParent.spouseIds.length === 0) {
        suggestions.push({
          type: 'missing_second_parent_and_spouse',
          affectedIds: [m.id, knownParent.id],
          description:
            `${m.name} (${m.id}) has only one recorded parent: ${knownParent.name} (${knownParent.id}), ` +
            `who has no recorded spouse. Consider adding ${knownParent.name}'s spouse to complete the family record.`,
        })
      }
    }
  }

  // ── 13. In-law as child — structural type confusion ─────────────────────
  //
  // Pattern: Person A has parentIds = [P, Q] AND A has a spouse S,
  // and P (or Q) is also in S.parentIds.
  //
  // This means A is modelled as a biological child of their spouse's parents.
  // The most common cause: someone adds a brother-in-law (or sister-in-law) by
  // filling in the in-law's parents rather than wiring a spouse edge.
  //
  // Auto-fix (100 % confidence) when ALL of A's parentIds overlap with the
  // spouse's parentIds — i.e. A has NO OTHER parents outside the in-law set.
  // Flag-only (no auto-fix) when the overlap is partial (unusual adoption / step
  // parent scenario that needs human review).

  for (const m of cleaned) {
    if (m.parentIds.length === 0 || m.spouseIds.length === 0) continue

    for (const spouseId of m.spouseIds) {
      const spouse = byId.get(spouseId)
      if (!spouse || spouse.parentIds.length === 0) continue

      const spouseParentSet = new Set(spouse.parentIds)
      const sharedWithSpouseParents = m.parentIds.filter(pid => spouseParentSet.has(pid))

      if (sharedWithSpouseParents.length === 0) continue

      const allParentsAreInLawParents = sharedWithSpouseParents.length === m.parentIds.length
      const relLabel = (m.relationship ?? '').toLowerCase()
      const isInLawLabel =
        relLabel.includes('in-law') ||
        relLabel.includes('brother-in-law') ||
        relLabel.includes('sister-in-law')

      const confidence = allParentsAreInLawParents ? 100 : 65

      issues.push({
        id: issId(),
        severity: allParentsAreInLawParents ? 'error' : 'warning',
        type: 'inlaw_as_child',
        affectedIds: [m.id, spouseId, ...sharedWithSpouseParents],
        description:
          `${m.name} (${m.id}) is modelled as a biological child of ` +
          `[${sharedWithSpouseParents.map(pid => byId.get(pid)?.name ?? pid).join(', ')}], ` +
          `but those same people are also the parents of ${m.name}'s spouse ` +
          `${spouse.name} (${spouseId}). ` +
          (allParentsAreInLawParents
            ? `All of ${m.name}'s parentIds belong to the in-law family — auto-removing. ` +
              `${m.name} connects to this family tree only through the marriage edge with ${spouse.name}.`
            : `Partial overlap — needs human review. ${m.name} may be a step-sibling or adoptee.`),
      })

      if (allParentsAreInLawParents) {
        const oldParents = [...m.parentIds]
        // Remove ALL parentIds — A has no biological parents in this tree other than the in-law set
        m.parentIds = []
        fixes.push({
          memberId: m.id,
          memberName: m.name,
          issue: 'inlaw_as_child — removed in-law parentIds',
          old_value: oldParents,
          new_value: [],
          confidence_score: confidence,
        })

        // Ensure spouse link is bidirectional
        if (!spouse.spouseIds.includes(m.id)) {
          const oldSpouseSpouses = [...spouse.spouseIds]
          spouse.spouseIds = dedup([...spouse.spouseIds, m.id])
          fixes.push({
            memberId: spouse.id,
            memberName: spouse.name,
            issue: 'inlaw_as_child — added missing bidirectional spouse link',
            old_value: oldSpouseSpouses,
            new_value: spouse.spouseIds,
            confidence_score: 100,
          })
        }
        if (!m.spouseIds.includes(spouseId)) {
          const oldMSpouses = [...m.spouseIds]
          m.spouseIds = dedup([...m.spouseIds, spouseId])
          fixes.push({
            memberId: m.id,
            memberName: m.name,
            issue: 'inlaw_as_child — confirmed bidirectional spouse link',
            old_value: oldMSpouses,
            new_value: m.spouseIds,
            confidence_score: 100,
          })
        }
      }
    }
  }

  // ── 13b. Cross-cluster conflicting parentage (generic) ───────────────────
  // Detects when a member's parentIds span multiple affiliated family clusters.
  // A person can only have one biological family of origin: if Parent P1 belongs
  // to affiliated cluster "Rao" and Parent P2 belongs to the core tree, the child
  // is biologically impossible — they cannot have parents from two unrelated families.
  //
  // This generalises the hardcoded Priya/Rao scenario: any cross-cluster
  // parentage conflict is caught, regardless of which families are involved.
  //
  // Flag-only (no auto-fix): requires manual resolution because only the family
  // admin knows which parent set is correct (natal vs. in-law misclassification).

  for (const m of cleaned) {
    if (m.parentIds.length < 2) continue

    const clusterMap = new Map<string, string[]>()
    for (const pid of m.parentIds) {
      const parent = byId.get(pid)
      if (!parent) continue
      const cluster = parent.affiliatedFamilyId ?? '__core__'
      if (!clusterMap.has(cluster)) clusterMap.set(cluster, [])
      clusterMap.get(cluster)!.push(pid)
    }

    if (clusterMap.size > 1) {
      const clusterDesc = [...clusterMap.entries()]
        .map(([cluster, ids]) => {
          const names = ids.map(pid => byId.get(pid)?.name ?? pid).join(', ')
          const clusterLabel =
            cluster === '__core__'
              ? 'core family'
              : `affiliated family "${byId.get(ids[0])?.affiliatedFamilyName ?? cluster}"`
          return `${clusterLabel}: [${names}]`
        })
        .join(' vs ')

      issues.push({
        id: issId(),
        severity: 'error',
        type: 'conflicting_parentage',
        affectedIds: [m.id, ...m.parentIds],
        description:
          `${m.name} (${m.id}) has parents from different family clusters — contradictory biological origin. ` +
          `${clusterDesc}. ` +
          `A person can only have one biological family of origin. ` +
          `Resolution options: (1) If the affiliated-family parents are correct, remove the core-family parents and update the sibling relationships accordingly. ` +
          `(2) If the core-family parents are correct, reclassify the affiliated family connection as an in-law relationship (not a natal parent). ` +
          `This requires manual admin decision and cannot be auto-fixed.`,
      })
    }
  }

  // ── 14. Orphan node detection ────────────────────────────────────────────
  // A node with no parents, no spouses, and no children (no one references it
  // as a parent) is completely disconnected from the family graph.
  // Emitted as a suggestion (not error) because standalone nodes may be
  // intentionally added before relationships are wired.

  const isParent = new Set<string>()
  for (const m of cleaned) {
    for (const pid of m.parentIds) isParent.add(pid)
  }

  for (const m of cleaned) {
    if (m.parentIds.length === 0 && m.spouseIds.length === 0 && !isParent.has(m.id)) {
      suggestions.push({
        type: 'orphan_node',
        affectedIds: [m.id],
        description:
          `${m.name} (${m.id}) has no parents, no spouses, and no children. ` +
          `This node is completely disconnected from the family graph. ` +
          `Connect them to the tree by adding at least one relationship (parent, spouse, or child).`,
      })
    }
  }

  return {
    cleaned_members: cleaned,
    issues_found: issues,
    fixes_applied: fixes,
    suggestions,
  }
}

// ── Audit report formatter ────────────────────────────────────────────────────

export function formatAuditReport(result: NormalizationResult): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '        FAMILY TREE NORMALIZATION ENGINE — AUDIT REPORT',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Total members processed  : ${result.cleaned_members.length}`,
    `Issues found             : ${result.issues_found.length}`,
    `  ├─ Errors              : ${result.issues_found.filter(i => i.severity === 'error').length}`,
    `  ├─ Warnings            : ${result.issues_found.filter(i => i.severity === 'warning').length}`,
    `  └─ Info                : ${result.issues_found.filter(i => i.severity === 'info').length}`,
    `Fixes applied            : ${result.fixes_applied.length}`,
    `Suggestions              : ${result.suggestions.length}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '  ISSUES FOUND',
    '───────────────────────────────────────────────────────────────',
  ]

  for (const issue of result.issues_found) {
    const icon = issue.severity === 'error' ? '✖' : issue.severity === 'warning' ? '⚠' : 'ℹ'
    lines.push(`${icon} [${issue.id}] ${issue.type.toUpperCase()}`)
    lines.push(`  Severity : ${issue.severity}`)
    lines.push(`  Affected : ${issue.affectedIds.join(', ')}`)
    lines.push(`  Detail   : ${issue.description}`)
    lines.push('')
  }

  lines.push('───────────────────────────────────────────────────────────────')
  lines.push('  FIXES APPLIED')
  lines.push('───────────────────────────────────────────────────────────────')

  for (const fix of result.fixes_applied) {
    lines.push(`✔ ${fix.memberName} (${fix.memberId})`)
    lines.push(`  Issue      : ${fix.issue}`)
    lines.push(`  Old value  : ${JSON.stringify(fix.old_value)}`)
    lines.push(`  New value  : ${JSON.stringify(fix.new_value)}`)
    lines.push(`  Confidence : ${fix.confidence_score}%`)
    lines.push('')
  }

  lines.push('───────────────────────────────────────────────────────────────')
  lines.push('  SUGGESTIONS (not auto-applied)')
  lines.push('───────────────────────────────────────────────────────────────')

  for (const sug of result.suggestions) {
    lines.push(`→ [${sug.type}]`)
    lines.push(`  Affected : ${sug.affectedIds.join(', ')}`)
    lines.push(`  Detail   : ${sug.description}`)
    lines.push('')
  }

  lines.push('═══════════════════════════════════════════════════════════════')
  return lines.join('\n')
}
