import { describe, it, expect } from 'vitest'
import {
  scoreCandidate,
  findExactNameMatch,
  isRecommendedClaimMatch,
  normalizeStoredName,
  type MatchCandidate,
} from '@/lib/match-detection'

const base: MatchCandidate = {
  nodeId: 'n1',
  nodeName: 'Rahul Sharma',
  familyId: 'f1',
  familyName: 'Sharma',
  addedByName: null,
  relationship: null,
  birthYear: 1990,
  phone: null,
  email: null,
}

describe('scoreCandidate — duplicate detection scoring', () => {
  it('returns a high-tier match on exact phone (strong signal)', () => {
    // phone matching compares digits-only (no country-code stripping), so both
    // sides must reduce to the same digit string.
    const r = scoreCandidate(
      { ...base, phone: '(415) 555-1234' },
      { name: 'Rahul Sharma', birthYear: 1990, phone: '415.555.1234' },
    )
    expect(r).not.toBeNull()
    expect(r!.matchReasons).toContain('phone')
    expect(r!.matchReasons).toContain('birth_year_exact')
    expect(r!.confidenceTier).toBe('high')
    expect(isRecommendedClaimMatch(r!)).toBe(true)
  })

  it('matches on exact email regardless of name differences', () => {
    const r = scoreCandidate(
      { ...base, nodeName: 'R. Sharma', email: 'Rahul@Example.com' },
      { name: 'Completely Different', email: 'rahul@example.com' },
    )
    expect(r).not.toBeNull()
    expect(r!.matchReasons).toContain('email')
    expect(isRecommendedClaimMatch(r!)).toBe(true)
  })

  it('returns null below the minimum score (no false-positive duplicate)', () => {
    const r = scoreCandidate(
      { ...base, nodeName: 'Zxqw Vbnm', birthYear: 1950 },
      { name: 'Rahul Sharma', birthYear: 1990 },
    )
    expect(r).toBeNull()
  })

  it('awards a structural bonus when candidate already fills the parent slot for a sibling', () => {
    const ctx = {
      addingRelationship: 'father',
      addingForMemberId: 'me',
      allMembers: [
        { id: 'me', name: 'Rahul', parentIds: ['dad'], spouseIds: [] },
        { id: 'sib', name: 'Shubham', parentIds: ['dad'], spouseIds: [] },
        { id: 'dad', name: 'SD Meshram', parentIds: [], spouseIds: [], gender: 'male' },
      ],
    }
    const r = scoreCandidate(
      { ...base, nodeId: 'dad', nodeName: 'Sukhdeo', birthYear: null },
      { name: 'Sukheo', birthYear: null },
      ctx,
    )
    expect(r).not.toBeNull()
    expect(r!.matchReasons).toContain('structural_parent')
  })
})

describe('findExactNameMatch — hard-block duplicate prevention', () => {
  const members = [
    { id: 'a', name: 'Shubham Meshram' },
    { id: 'b', name: 'Rahul Sharma' },
  ]

  it('finds a case/space-insensitive exact match', () => {
    expect(findExactNameMatch(members, '  shubham   MESHRAM ')?.id).toBe('a')
  })

  it('returns null when there is no match', () => {
    expect(findExactNameMatch(members, 'Nobody Here')).toBeNull()
  })

  it('skips the excluded id (editing scenario)', () => {
    expect(findExactNameMatch(members, 'Rahul Sharma', 'b')).toBeNull()
  })
})

describe('normalizeStoredName', () => {
  it('collapses whitespace but preserves casing', () => {
    expect(normalizeStoredName('  Shubham   Meshram  ')).toBe('Shubham Meshram')
  })
})
