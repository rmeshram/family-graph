/**
 * lib/trust-score.ts
 *
 * Trust Score computation — SPEC §5.3 (FF: enableTrustScore).
 *
 * Pure, deterministic computation. No DB, no side effects — safe to unit test
 * and to call from both server and client. The persisted `trust_score` column
 * on `family_members` (added in a future migration) is populated asynchronously
 * by feeding the inputs below into `computeTrustScore`.
 *
 * Score range: 0–100. Weights are fixed by the spec — do not change without
 * updating SPEC §5.3.
 */

import type { FamilyMember } from './types'

/** Minimal node fields the score reads — keeps callers from over-fetching. */
export type TrustScoreMember = Pick<
  FamilyMember,
  | 'isClaimed'
  | 'claimedByUserId'
  | 'photoUrl'
  | 'biodataPhotoUrl'
  | 'birthYear'
  | 'dateOfBirth'
  | 'gotra'
  | 'isBiodataVisible'
>

export interface TrustScoreInput {
  /** The node being scored. */
  member: TrustScoreMember
  /** Whether the claiming user has a verified phone number. */
  claimantPhoneVerified?: boolean
  /** This node's parent nodes (to check if ≥1 parent is claimed by a real user). */
  parents?: Array<Pick<FamilyMember, 'isClaimed' | 'claimedByUserId'>>
  /** Total active members in this node's family graph. */
  familyMemberCount?: number
  /** Biodata completeness as a percentage (0–100). >80 earns the biodata points. */
  biodataCompletionPct?: number
}

export interface TrustScoreComponent {
  key: string
  label: string
  points: number
  earned: boolean
}

export type TrustScoreBucket = '0-40' | '40-70' | '70-100'
/** Legacy 3-tier kept for analytics backward-compat. */
export type TrustScoreTier = 'low' | 'medium' | 'high'
/** 5-tier display system shown in UI badges and trust strip. */
export type TrustScoreTier5 = 'unverified' | 'basic' | 'trusted' | 'family_verified' | 'elite'

export interface TrustScoreResult {
  /** Total score, 0–100 (capped). */
  total: number
  components: TrustScoreComponent[]
  /** Analytics bucket per SPEC §24.6 (`trust_score_bucket`). */
  bucket: TrustScoreBucket
  /** Legacy 3-tier for analytics. */
  tier: TrustScoreTier
  /** 5-tier display tier shown in UI. */
  tier5: TrustScoreTier5
  /** Human-readable label for the 5-tier. */
  tierLabel: string
}

const isClaimed = (n?: Pick<FamilyMember, 'isClaimed' | 'claimedByUserId'>): boolean =>
  !!n && (n.isClaimed === true || !!n.claimedByUserId)

/**
 * Compute a node's trust score (SPEC §5.3).
 * Weights sum to exactly 100 when every signal is present.
 */
export function computeTrustScore(input: TrustScoreInput): TrustScoreResult {
  const { member, claimantPhoneVerified, parents, familyMemberCount, biodataCompletionPct } = input

  const hasPhoto = !!(member.photoUrl?.trim() || member.biodataPhotoUrl?.trim())
  const hasBirthDate = member.birthYear != null || !!member.dateOfBirth
  const hasGotra = !!member.gotra?.trim()
  const parentClaimed = (parents ?? []).some(isClaimed)
  const hasThreePlus = (familyMemberCount ?? 0) >= 3
  const biodataComplete = member.isBiodataVisible === true && (biodataCompletionPct ?? 0) > 80

  const components: TrustScoreComponent[] = [
    { key: 'claimed', label: 'Claimed by a real user', points: 10, earned: isClaimed(member) },
    { key: 'phone_verified', label: 'Claimant has verified phone', points: 15, earned: claimantPhoneVerified === true },
    { key: 'photo', label: 'Has a photo', points: 15, earned: hasPhoto },
    { key: 'birth_date', label: 'Birth date filled', points: 10, earned: hasBirthDate },
    { key: 'gotra', label: 'Gotra filled', points: 10, earned: hasGotra },
    { key: 'parent_claimed', label: 'A parent is claimed by a real user', points: 15, earned: parentClaimed },
    { key: 'family_size', label: 'At least 3 family members', points: 10, earned: hasThreePlus },
    { key: 'biodata_complete', label: 'Biodata active and >80% complete', points: 15, earned: biodataComplete },
  ]

  const total = Math.min(
    100,
    components.reduce((sum, c) => sum + (c.earned ? c.points : 0), 0),
  )

  return { total, components, bucket: trustScoreBucket(total), tier: trustScoreTier(total), tier5: trustScoreTier5(total), tierLabel: trustScoreTierLabel(total) }
}

/** Analytics bucket per SPEC §24.6. */
export function trustScoreBucket(total: number): TrustScoreBucket {
  if (total < 40) return '0-40'
  if (total < 70) return '40-70'
  return '70-100'
}

/** Display tier for trust badges. */
export function trustScoreTier(total: number): TrustScoreTier {
  if (total < 40) return 'low'
  if (total < 70) return 'medium'
  return 'high'
}

/** 5-tier display system: 0–19 Unverified, 20–39 Basic, 40–59 Trusted, 60–79 Family-Verified, 80–100 Elite. */
export function trustScoreTier5(total: number): TrustScoreTier5 {
  if (total < 20) return 'unverified'
  if (total < 40) return 'basic'
  if (total < 60) return 'trusted'
  if (total < 80) return 'family_verified'
  return 'elite'
}

/** Human-readable label for the 5-tier. */
export function trustScoreTierLabel(total: number): string {
  const tier = trustScoreTier5(total)
  const labels: Record<TrustScoreTier5, string> = {
    unverified: 'Unverified',
    basic: 'Basic',
    trusted: 'Trusted',
    family_verified: 'Family Verified',
    elite: 'Elite',
  }
  return labels[tier]
}
