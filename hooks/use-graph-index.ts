'use client'

import { useMemo } from 'react'
import type { FamilyMember } from '@/lib/types'

/**
 * useGraphIndex — O(1) relationship lookups for the family graph.
 *
 * Precomputes index structures from the members array once, so the render
 * loop never runs O(n) searches (e.g. members.some(...)) per node.
 *
 * Scales:
 *  - parentSet:    O(1) hasChildren check
 *  - childrenMap:  O(1) children list per node
 *  - spouseMap:    O(1) spouse list per node
 *  - memberMap:    O(1) member lookup by id
 *  - generationMap: O(1) list of members per generation
 */
export interface GraphIndex {
  /** Set of all node IDs that have at least one child. O(1) has-children check. */
  parentSet: Set<string>
  /** Map from parent ID → array of child IDs */
  childrenMap: Map<string, string[]>
  /** Map from member ID → array of spouse IDs */
  spouseMap: Map<string, string[]>
  /** Map from member ID → FamilyMember */
  memberMap: Map<string, FamilyMember>
  /** Map from generation number → array of member IDs */
  generationMap: Map<number, string[]>
  /** Total edge count (parent-child + spouse) — useful for perf budgeting */
  edgeCount: number
}

export function useGraphIndex(members: FamilyMember[]): GraphIndex {
  return useMemo<GraphIndex>(() => {
    const parentSet = new Set<string>()
    const childrenMap = new Map<string, string[]>()
    const spouseMap = new Map<string, string[]>()
    const memberMap = new Map<string, FamilyMember>()
    const generationMap = new Map<number, string[]>()
    let edgeCount = 0

    for (const m of members) {
      memberMap.set(m.id, m)

      // Generation index
      if (!generationMap.has(m.generation)) generationMap.set(m.generation, [])
      generationMap.get(m.generation)!.push(m.id)

      // Parent → children index
      for (const pid of m.parentIds) {
        parentSet.add(pid)
        if (!childrenMap.has(pid)) childrenMap.set(pid, [])
        childrenMap.get(pid)!.push(m.id)
        edgeCount++
      }

      // Spouse index (store both directions so lookup is O(1) from either side)
      spouseMap.set(m.id, m.spouseIds)
      edgeCount += m.spouseIds.length
    }

    return { parentSet, childrenMap, spouseMap, memberMap, generationMap, edgeCount }
  }, [members])
}
