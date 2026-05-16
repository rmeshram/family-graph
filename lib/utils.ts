import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { FamilyMember } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * BFS from rootId across parent/spouse/child edges.
 * Returns a map of memberId → degree (hops from root).
 * Root itself = degree 0.
 */
export function computeDegrees(
  members: FamilyMember[],
  rootId: string
): Map<string, number> {
  const degrees = new Map<string, number>()
  if (!rootId) return degrees

  // Build adjacency: for each member, collect all connected IDs
  const adj = new Map<string, Set<string>>()
  members.forEach((m) => {
    if (!adj.has(m.id)) adj.set(m.id, new Set())
    m.parentIds.forEach((pid) => {
      adj.get(m.id)!.add(pid)
      if (!adj.has(pid)) adj.set(pid, new Set())
      adj.get(pid)!.add(m.id) // bidirectional
    })
    m.spouseIds.forEach((sid) => {
      adj.get(m.id)!.add(sid)
      if (!adj.has(sid)) adj.set(sid, new Set())
      adj.get(sid)!.add(m.id)
    })
  })

  // BFS
  const queue: string[] = [rootId]
  degrees.set(rootId, 0)
  while (queue.length > 0) {
    const current = queue.shift()!
    const currentDeg = degrees.get(current)!
    adj.get(current)?.forEach((neighbour) => {
      if (!degrees.has(neighbour)) {
        degrees.set(neighbour, currentDeg + 1)
        queue.push(neighbour)
      }
    })
  }

  return degrees
}

/**
 * Filter members to those within maxDegree of rootId.
 * If rootId is null/not found, returns all members.
 */
export function filterByDegree(
  members: FamilyMember[],
  rootId: string | null,
  maxDegree: number
): FamilyMember[] {
  if (!rootId) return members
  const degrees = computeDegrees(members, rootId)
  // Always include disconnected members so they're never silently hidden
  return members.filter((m) => {
    const d = degrees.get(m.id)
    return d === undefined || d <= maxDegree
  })
}

/**
 * Shared profile completeness computation. Uses 8 weighted fields.
 * Returns a score (0-100) and an array of missing field labels.
 */
export function computeProfileCompleteness(member: FamilyMember): { score: number; missing: string[] } {
  const checks = [
    { label: 'Photo', has: !!member.photoUrl },
    { label: 'Birth year', has: !!member.birthYear },
    { label: 'Birthplace', has: !!member.birthPlace },
    { label: 'Occupation', has: !!member.occupation },
    { label: 'Biography', has: !!member.bio },
    { label: 'Current place', has: !!member.currentPlace },
    { label: 'Gotra', has: !!member.gotra },
    { label: 'Phone / email', has: !!(member.phone || member.email) },
  ]
  const done = checks.filter(c => c.has)
  const missing = checks.filter(c => !c.has).map(c => c.label)
  return { score: Math.round((done.length / checks.length) * 100), missing }
}
