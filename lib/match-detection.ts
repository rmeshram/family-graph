// lib/match-detection.ts
// Confidence scoring for "is this node you?" matching.
// Used in both the API layer and onboarding client side.

export type ConfidenceTier = 'high' | 'medium' | 'low'

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

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
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

export function scoreCandidate(
  candidate: MatchCandidate,
  userProfile: {
    name: string
    birthYear?: number | null
    phone?: string | null
    email?: string | null
  }
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
