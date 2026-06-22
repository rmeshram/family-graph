import { describe, it, expect } from 'vitest'
import { unionMemberIds, remapMemberIds } from '@/lib/graph-merge'

describe('unionMemberIds', () => {
  it('unions two arrays and removes duplicates (happy path)', () => {
    expect(unionMemberIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('excludes the merge-pair ids to prevent self-referential edges', () => {
    // primary=P, target=T being merged; neither should remain as its own parent
    expect(unionMemberIds(['P', 'x'], ['T', 'y'], ['P', 'T'])).toEqual(['x', 'y'])
  })

  it('handles null / undefined inputs (edge case)', () => {
    expect(unionMemberIds(null, undefined)).toEqual([])
    expect(unionMemberIds(['a'], null)).toEqual(['a'])
  })

  it('is idempotent on already-clean input', () => {
    expect(unionMemberIds(['a', 'b'], [])).toEqual(['a', 'b'])
  })
})

describe('remapMemberIds', () => {
  it('remaps occurrences of fromId to toId (happy path)', () => {
    expect(remapMemberIds(['dup', 'x'], 'dup', 'primary')).toEqual(['primary', 'x'])
  })

  it('deduplicates when the array already contains toId after remap', () => {
    // A child referencing both primary and the duplicate would produce a duplicate
    // edge after remap. remapMemberIds deduplicates to prevent double-edges post-merge,
    // which would violate the DB uniqueness constraint (migration 043).
    expect(remapMemberIds(['primary', 'dup'], 'dup', 'primary')).toEqual(['primary'])
  })

  it('leaves arrays without fromId unchanged', () => {
    expect(remapMemberIds(['a', 'b'], 'dup', 'primary')).toEqual(['a', 'b'])
  })

  it('handles null / undefined (edge case)', () => {
    expect(remapMemberIds(undefined, 'x', 'y')).toEqual([])
    expect(remapMemberIds(null, 'x', 'y')).toEqual([])
  })
})
