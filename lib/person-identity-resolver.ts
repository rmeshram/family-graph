/**
 * Person Identity Resolver — Phase 2 of the Graph Integrity Pipeline
 *
 * Detects duplicate people using multi-signal matching:
 *   - Token-based name similarity (handles abbreviations: "Shikha M" ≡ "Shikha Meshram")
 *   - Shared parents
 *   - Shared/mutual spouse
 *   - Same birth year
 *   - Same family_id (when present)
 *
 * Duplicate merge rules:
 *   DO merge (high confidence ≥ 80):
 *     - Same name tokens (accounting for initials) + same spouse
 *     - Same name tokens + same parents + same birth year
 *
 *   DO NOT merge when:
 *     - Same name but different parents AND different birth year AND different spouse
 *     - Same surname only (no first-name match)
 *     - Different birth year > 3 years AND no shared structural signals
 *
 * When merging, the canonical record is the one with more filled-in fields.
 * All references to the removed ID are rewritten to the canonical ID.
 */

import { FamilyMember } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolvedIdentity {
  /** The surviving canonical ID. */
  canonicalId: string
  canonicalName: string
  /** All alternative names/IDs that were detected as the same person. */
  aliases: string[]
  /** IDs that were removed and merged into the canonical record. */
  mergedFromIds: string[]
  confidence: number
  matchReasons: string[]
}

export interface PotentialDuplicate {
  idA: string
  nameA: string
  idB: string
  nameB: string
  confidence: number
  matchReasons: string[]
  /** true = auto-merged into canonicalId; false = flagged for human review */
  autoMerged: boolean
  canonicalId: string | null
}

export interface IdentityResolutionResult {
  /** Members after high-confidence duplicates have been merged. */
  members: FamilyMember[]
  /** All auto-merged canonical identities. */
  resolvedIdentities: ResolvedIdentity[]
  /** Medium-confidence candidates flagged but NOT auto-merged. */
  potentialDuplicates: PotentialDuplicate[]
}

// ── Name-matching helpers ─────────────────────────────────────────────────────

function normaliseTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Token-based name similarity that understands initials.
 * "Shikha M"  vs "Shikha Meshram" → 1.0  (M is an initial of Meshram)
 * "Rahul M"   vs "Rahul Mishra"   → 1.0
 * "Kamla"     vs "Kamla Sharma"   → 0.67 (one of two tokens matches)
 */
function tokenNameSimilarity(a: string, b: string): number {
  const tokA = normaliseTokens(a)
  const tokB = normaliseTokens(b)
  if (tokA.length === 0 || tokB.length === 0) return 0

  let matches = 0
  const usedB = new Set<number>()

  for (const ta of tokA) {
    for (let j = 0; j < tokB.length; j++) {
      if (usedB.has(j)) continue
      const tb = tokB[j]
      const exactMatch = ta === tb
      // Initial abbreviation: single letter matches the first letter of the full token
      const aIsInitial = ta.length === 1 && tb.startsWith(ta)
      const bIsInitial = tb.length === 1 && ta.startsWith(tb)
      if (exactMatch || aIsInitial || bIsInitial) {
        matches++
        usedB.add(j)
        break
      }
    }
  }

  return matches / Math.max(tokA.length, tokB.length)
}

/** Levenshtein distance for full-string fuzzy match. */
function levenshtein(a: string, b: string): number {
  const m = a.length; const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function fullNameSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim()
  const nb = b.toLowerCase().trim()
  if (na === nb) return 1
  const maxLen = Math.max(na.length, nb.length)
  return maxLen === 0 ? 1 : 1 - levenshtein(na, nb) / maxLen
}

/** Combined similarity: max of token-based and full-string approaches. */
function nameSimilarity(a: string, b: string): number {
  return Math.max(tokenNameSimilarity(a, b), fullNameSimilarity(a, b))
}

/** Intersect two arrays. */
function intersect<T>(a: T[], b: T[]): T[] {
  const s = new Set(b); return a.filter(x => s.has(x))
}

// ── Field completeness score (higher = more data → preferred as canonical) ────

function completenessScore(m: FamilyMember): number {
  return [
    m.name, m.birthYear, m.birthPlace, m.occupation, m.bio,
    m.gender, m.gotra, m.phone, m.email, m.photoUrl,
    m.stories?.length, m.milestones?.length,
  ].filter(v => v !== undefined && v !== null && v !== '').length
}

// ── Deep-clone helper ─────────────────────────────────────────────────────────

function cloneMembers(members: FamilyMember[]): FamilyMember[] {
  return members.map(m => ({
    ...m,
    parentIds: [...m.parentIds],
    spouseIds: [...m.spouseIds],
    tags: m.tags ? [...m.tags] : undefined,
    stories: m.stories ? [...m.stories] : undefined,
    milestones: m.milestones ? [...m.milestones] : undefined,
  }))
}

// ── Rewrite all references when merging ──────────────────────────────────────

function rewriteRefs(
  members: FamilyMember[],
  removedId: string,
  canonicalId: string,
): void {
  for (const m of members) {
    m.parentIds = [...new Set(m.parentIds.map(id => id === removedId ? canonicalId : id))]
    m.spouseIds = [...new Set(m.spouseIds.map(id => id === removedId ? canonicalId : id))]
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export function resolvePersonIdentities(
  members: FamilyMember[],
  /** 0–100: pairs at or above this score are auto-merged. Default 82. */
  autoMergeThreshold = 82,
): IdentityResolutionResult {
  const working = cloneMembers(members)
  const byId = new Map<string, FamilyMember>(working.map(m => [m.id, m]))

  const resolvedIdentities: ResolvedIdentity[] = []
  const potentialDuplicates: PotentialDuplicate[] = []

  /** IDs removed via merge — skip these when they reappear as secondary candidates. */
  const mergedAway = new Set<string>()
  /** IDs that have been involved in a merge (canonical or merged-from). */
  const processed = new Set<string>()

  const list = working.filter(m => !mergedAway.has(m.id))

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (mergedAway.has(a.id) || mergedAway.has(b.id)) continue

      // ── Compute signals ────────────────────────────────────────────────
      const nameSim = nameSimilarity(a.name, b.name)
      if (nameSim < 0.72) continue // fast-reject dissimilar names

      const sharedParents = intersect(a.parentIds, b.parentIds).length > 0
      const mutualSpouse =
        a.spouseIds.includes(b.id) ||
        b.spouseIds.includes(a.id) ||
        intersect(a.spouseIds, b.spouseIds).length > 0
      const sameYear =
        a.birthYear !== undefined &&
        b.birthYear !== undefined &&
        a.birthYear === b.birthYear
      const closeYear =
        a.birthYear !== undefined &&
        b.birthYear !== undefined &&
        Math.abs(a.birthYear - b.birthYear) <= 2

      // ── Guard: definitely different people ─────────────────────────────
      const birthYearFarApart =
        a.birthYear !== undefined &&
        b.birthYear !== undefined &&
        Math.abs(a.birthYear - b.birthYear) > 3
      const differentParents =
        a.parentIds.length > 0 &&
        b.parentIds.length > 0 &&
        intersect(a.parentIds, b.parentIds).length === 0
      if (birthYearFarApart && differentParents && !mutualSpouse) continue

      // ── Confidence scoring ─────────────────────────────────────────────
      const reasons: string[] = []
      let score = Math.round(nameSim * 50) // up to 50 pts for name

      if (nameSim >= 0.95) {
        reasons.push(`near-identical name (${(nameSim * 100).toFixed(0)}%)`)
      } else {
        reasons.push(`name similarity ${(nameSim * 100).toFixed(0)}%`)
      }

      if (sharedParents) { score += 20; reasons.push('shared parent(s)') }
      if (mutualSpouse) { score += 20; reasons.push('same or shared spouse') }
      if (sameYear) { score += 10; reasons.push(`same birth year (${a.birthYear})`) }
      else if (closeYear) { score += 5; reasons.push(`birth years within 2 (${a.birthYear} vs ${b.birthYear})`) }

      // Token match bonus: if initials match (e.g., "M" → "Meshram")
      if (tokenNameSimilarity(a.name, b.name) >= 0.95 && fullNameSimilarity(a.name, b.name) < 0.80) {
        score += 15
        reasons.push('initial-expansion match (abbreviated name)')
      }

      const candidate: PotentialDuplicate = {
        idA: a.id, nameA: a.name,
        idB: b.id, nameB: b.name,
        confidence: score,
        matchReasons: reasons,
        autoMerged: false,
        canonicalId: null,
      }

      // ── Auto-merge decision ────────────────────────────────────────────
      if (score >= autoMergeThreshold) {
        // Canonical = the record with more data; ties broken by lower ID (stable sort)
        const scoreA = completenessScore(a)
        const scoreB = completenessScore(b)
        const canonical = scoreA >= scoreB ? a : b
        const removed = scoreA >= scoreB ? b : a

        // Merge fields from removed into canonical (preserve more complete data)
        if (!canonical.birthYear && removed.birthYear) canonical.birthYear = removed.birthYear
        if (!canonical.birthPlace && removed.birthPlace) canonical.birthPlace = removed.birthPlace
        if (!canonical.occupation && removed.occupation) canonical.occupation = removed.occupation
        if (!canonical.bio && removed.bio) canonical.bio = removed.bio
        if (!canonical.gender && removed.gender) canonical.gender = removed.gender
        if (!canonical.gotra && removed.gotra) canonical.gotra = removed.gotra
        if (!canonical.phone && removed.phone) canonical.phone = removed.phone
        if (!canonical.photoUrl && removed.photoUrl) canonical.photoUrl = removed.photoUrl

        // Merge relationships
        canonical.parentIds = [...new Set([...canonical.parentIds, ...removed.parentIds])]
          .filter(id => id !== canonical.id && id !== removed.id)
        canonical.spouseIds = [...new Set([...canonical.spouseIds, ...removed.spouseIds])]
          .filter(id => id !== canonical.id && id !== removed.id)

        // Rewrite all references in the working array
        rewriteRefs(working, removed.id, canonical.id)

        mergedAway.add(removed.id)
        processed.add(canonical.id)
        processed.add(removed.id)

        candidate.autoMerged = true
        candidate.canonicalId = canonical.id

        resolvedIdentities.push({
          canonicalId: canonical.id,
          canonicalName: canonical.name,
          aliases: [removed.name],
          mergedFromIds: [removed.id],
          confidence: score,
          matchReasons: reasons,
        })
      }

      potentialDuplicates.push(candidate)
    }
  }

  // Remove merged-away members from the final array
  const finalMembers = working.filter(m => !mergedAway.has(m.id))

  return { members: finalMembers, resolvedIdentities, potentialDuplicates }
}
