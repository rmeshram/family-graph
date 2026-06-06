// lib/match-detection.ts
// Confidence scoring for "is this node you?" matching.
// Used in both the API layer and onboarding client side.

import { levenshtein } from './utils'

export type ConfidenceTier = 'high' | 'medium' | 'low'

// ─── Soundex ─────────────────────────────────────────────────────────────────
// Classic Soundex algorithm for phonetic matching.
// Helps catch transliteration variants common in South Asian names,
// e.g. "Sukheo"/"Sukhdeo", "Rajan"/"Rajan", "Priya"/"Pria".
const SOUNDEX_MAP: Record<string, string> = {
  b: '1', f: '1', p: '1', v: '1',
  c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
  d: '3', t: '3',
  l: '4',
  m: '5', n: '5',
  r: '6',
}

function soundex(s: string): string {
  const str = s.toLowerCase().replace(/[^a-z]/g, '')
  if (!str) return ''
  const first = str[0].toUpperCase()
  let code = first
  let prev = SOUNDEX_MAP[str[0]] ?? '0'
  for (let i = 1; i < str.length && code.length < 4; i++) {
    const d = SOUNDEX_MAP[str[i]] ?? '0'
    if (d !== '0' && d !== prev) {
      code += d
      prev = d
    } else if (d === '0') {
      prev = '0' // vowels/h/w/y reset the previous code
    }
  }
  return code.padEnd(4, '0')
}

export interface MatchCandidate {
  nodeId: string
  nodeName: string
  familyId: string
  familyName: string
  addedByName: string | null
  relationship: string | null
  birthYear: number | null
  phone: string | null
  email: string | null
}

// ─── Structural context for intra-family duplicate detection ─────────────────
// When a user adds a parent/spouse, we can check whether an existing node is
// ALREADY filling that structural role for a sibling — a strong signal that
// the two nodes are the same person even if the names differ significantly.
export interface StructuralContext {
  /** The relationship being added: 'father' | 'mother' | 'husband' | 'wife' | 'spouse' */
  addingRelationship: string
  /** The member ID for whom this person is being added (the adder's own node, or the focused node) */
  addingForMemberId: string
  /** All current family members — used to traverse shared parentage */
  allMembers: Array<{
    id: string
    name: string
    parentIds: string[]
    spouseIds: string[]
    gender?: string | null
  }>
}

export interface MatchResult {
  nodeId: string
  nodeName: string
  nodeInitials: string
  familyId: string
  familyName: string
  addedByName: string | null
  relationship: string | null
  confidenceScore: number
  confidenceTier: ConfidenceTier
  matchReasons: string[]
}

export function isRecommendedClaimMatch(match: Pick<MatchResult, 'confidenceTier' | 'matchReasons'>): boolean {
  return (
    match.confidenceTier === 'high' ||
    match.matchReasons.includes('email') ||
    match.matchReasons.includes('phone')
  )
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

/**
 * Trims and collapses multiple whitespace characters into single spaces.
 * Preserves original casing — suitable for storage and display.
 * e.g. "  Shubham   Meshram  " → "Shubham Meshram"
 */
export function normalizeStoredName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

const MIN_SCORE = 40

// ─── Structural bonus ────────────────────────────────────────────────────────
// Returns a bonus score if `candidateId` is already structurally filling the
// same role (parent / spouse) for a sibling or close relative of the adder.
// e.g., Rahul adds "Sukheo" as father; Shubham (Rahul's sibling) adds "SD Meshram"
// as father → candidateId matches an existing parent shared by the adder's siblings
// → structural bonus fires, raising the confidence score above the warning threshold.
function structuralBonus(
  candidateId: string,
  ctx: StructuralContext
): { score: number; reason: string } | null {
  const { addingRelationship, addingForMemberId, allMembers } = ctx
  const isParentRel = /^(father|mother|step-?father|step-?mother|foster-?father|foster-?mother)$/i.test(addingRelationship)
  const isSpouseRel = /^(husband|wife|spouse|partner)$/i.test(addingRelationship)

  if (!isParentRel && !isSpouseRel) return null

  const adder = allMembers.find(m => m.id === addingForMemberId)
  if (!adder) return null

  if (isParentRel) {
    // Find all siblings: members who share AT LEAST ONE parent with the adder.
    // A sibling's parent list is where we look for the candidate.
    const siblings = allMembers.filter(m =>
      m.id !== addingForMemberId &&
      m.parentIds.some(pid => adder.parentIds.includes(pid))
    )
    // Also include the adder themselves — if the adder already has this node
    // as a parent (re-add scenario), that's a direct structural hit.
    const candidates = [...siblings, adder]
    for (const rel of candidates) {
      if (rel.parentIds.includes(candidateId)) {
        return { score: 35, reason: 'structural_parent' }
      }
    }
    // Weaker signal: the candidate is already a parent-generation member (generation ≤ adder's implied generation)
    // This catches "there's already a male in the parent slot" without exact sibling proof.
    const adderParents = allMembers.filter(m => adder.parentIds.includes(m.id))
    const candidateNode = allMembers.find(m => m.id === candidateId)
    if (candidateNode) {
      const genderMatch =
        (/father/i.test(addingRelationship) && candidateNode.gender === 'male') ||
        (/mother/i.test(addingRelationship) && candidateNode.gender === 'female')
      if (genderMatch && adderParents.length > 0) {
        // Adder already has a parent of that gender — candidate is a duplicate of it
        const existingParent = adderParents.find(p =>
          (/father/i.test(addingRelationship) && p.gender === 'male') ||
          (/mother/i.test(addingRelationship) && p.gender === 'female')
        )
        if (existingParent && existingParent.id === candidateId) {
          return { score: 35, reason: 'structural_parent' }
        }
      }
    }
  }

  if (isSpouseRel) {
    const adderSpouseIds = adder.spouseIds ?? []
    if (adderSpouseIds.includes(candidateId)) {
      return { score: 30, reason: 'structural_spouse' }
    }
  }

  return null
}

export function scoreCandidate(
  candidate: MatchCandidate,
  userProfile: {
    name: string
    birthYear?: number | null
    phone?: string | null
    email?: string | null
  },
  structuralContext?: StructuralContext
): MatchResult | null {
  let score = 0
  const reasons: string[] = []

  // Strong signals — contact info
  if (
    candidate.phone &&
    userProfile.phone &&
    candidate.phone.replace(/\D/g, '') === userProfile.phone.replace(/\D/g, '')
  ) {
    score += 60
    reasons.push('phone')
  }
  if (
    candidate.email &&
    userProfile.email &&
    candidate.email.toLowerCase() === userProfile.email.toLowerCase()
  ) {
    score += 55
    reasons.push('email')
  }

  // Name match
  const a = normalizeName(candidate.nodeName)
  const b = normalizeName(userProfile.name)
  if (a && b) {
    if (a === b) {
      score += 15
      reasons.push('name')
    } else if (levenshtein(a, b) <= 2 && Math.max(a.length, b.length) >= 4) {
      score += 10
      reasons.push('name_fuzzy')
    } else {
      const aParts = a.split(' ')
      const bParts = b.split(' ')
      if (aParts[0] === bParts[0] && aParts[0].length >= 3) {
        score += 6
        reasons.push('first_name')
      }
      // Phonetic match — catches transliteration variants (Soundex)
      // Applied to first names only to avoid false positives on common surnames.
      const aSdx = soundex(aParts[0])
      const bSdx = soundex(bParts[0])
      if (
        aSdx === bSdx &&
        aSdx !== '' &&
        !reasons.includes('first_name') // already awarded above
      ) {
        score += 8
        reasons.push('name_phonetic')
      }
    }
  }

  // Birth year match
  if (candidate.birthYear && userProfile.birthYear) {
    const diff = Math.abs(candidate.birthYear - userProfile.birthYear)
    if (diff === 0) {
      score += 20
      reasons.push('birth_year_exact')
    } else if (diff <= 2) {
      score += 12
      reasons.push('birth_year_approx')
    }
  }

  // Structural context — sibling shares this parent / adder's existing spouse
  if (structuralContext) {
    const bonus = structuralBonus(candidate.nodeId, structuralContext)
    if (bonus) {
      score += bonus.score
      reasons.push(bonus.reason)
    }
  }

  if (score < MIN_SCORE) return null

  const cappedScore = Math.min(100, score)
  const tier: ConfidenceTier =
    cappedScore >= 80 ? 'high' : cappedScore >= 60 ? 'medium' : 'low'

  const initials = candidate.nodeName
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return {
    nodeId: candidate.nodeId,
    nodeName: candidate.nodeName,
    nodeInitials: initials || candidate.nodeName.substring(0, 2).toUpperCase(),
    familyId: candidate.familyId,
    familyName: candidate.familyName,
    addedByName: candidate.addedByName,
    relationship: candidate.relationship,
    confidenceScore: cappedScore,
    confidenceTier: tier,
    matchReasons: reasons,
  }
}

export function tierLabel(tier: ConfidenceTier): string {
  return tier === 'high'
    ? 'Likely you'
    : tier === 'medium'
      ? 'Possibly you'
      : 'Same name'
}

export function tierColor(tier: ConfidenceTier): string {
  return tier === 'high'
    ? 'text-green-400 bg-green-500/10 border-green-500/30'
    : tier === 'medium'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-slate-400 bg-slate-500/10 border-slate-500/30'
}

/**
 * Returns the first existing member whose stored name exactly matches
 * `newName` (case-insensitive, whitespace-normalized).
 *
 * Used for hard-block duplicate prevention in Add/QuickAdd dialogs.
 * Pass `excludeId` when editing so the member being edited is skipped.
 */
export function findExactNameMatch(
  existingMembers: { id: string; name: string; relationship?: string | null; birthYear?: number | null }[],
  newName: string,
  excludeId?: string,
): { id: string; name: string; relationship?: string | null; birthYear?: number | null } | null {
  const normalized = normalizeStoredName(newName).toLowerCase()
  if (!normalized) return null
  return (
    existingMembers.find(
      (m) => m.id !== excludeId && normalizeStoredName(m.name).toLowerCase() === normalized,
    ) ?? null
  )
}
