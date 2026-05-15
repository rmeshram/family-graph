/**
 * Relation Engine
 * Computes human-readable relationship labels between two family members.
 * Uses BFS with edge-type encoding to map paths to Indian/English labels.
 */

import type { FamilyMember } from './types'

type EdgeType = 'UP' | 'DOWN' | 'SPOUSE'

interface PathEdge {
  memberId: string
  edge: EdgeType
}

// ─── BFS with edge tracking ───────────────────────────────────────────────────

export function findRelationshipPath(
  fromId: string,
  toId: string,
  members: FamilyMember[]
): FamilyMember[] | null {
  if (fromId === toId) return []
  const memberMap = new Map(members.map(m => [m.id, m]))
  const visited = new Set<string>()
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }]

  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    if (id === toId) return path.map(i => memberMap.get(i)!).filter(Boolean)
    const m = memberMap.get(id)
    if (!m) continue
    const neighbors = [
      ...m.parentIds,
      ...m.spouseIds,
      ...members.filter(x => x.parentIds.includes(id)).map(x => x.id),
    ]
    for (const nId of neighbors) {
      if (!visited.has(nId)) queue.push({ id: nId, path: [...path, nId] })
    }
  }
  return null
}

function findEdgePath(
  fromId: string,
  toId: string,
  members: FamilyMember[]
): PathEdge[] | null {
  if (fromId === toId) return []
  const memberMap = new Map(members.map(m => [m.id, m]))
  const visited = new Set<string>()

  interface QueueItem { id: string; edges: PathEdge[] }
  const queue: QueueItem[] = [{ id: fromId, edges: [] }]

  while (queue.length > 0) {
    const { id, edges } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    if (id === toId) return edges

    const m = memberMap.get(id)
    if (!m) continue

    // UP: to parent
    for (const pid of m.parentIds) {
      if (!visited.has(pid))
        queue.push({ id: pid, edges: [...edges, { memberId: pid, edge: 'UP' }] })
    }
    // DOWN: to child
    for (const child of members.filter(x => x.parentIds.includes(id))) {
      if (!visited.has(child.id))
        queue.push({ id: child.id, edges: [...edges, { memberId: child.id, edge: 'DOWN' }] })
    }
    // SPOUSE
    for (const sid of m.spouseIds) {
      if (!visited.has(sid))
        queue.push({ id: sid, edges: [...edges, { memberId: sid, edge: 'SPOUSE' }] })
    }
  }
  return null
}

// ─── Label computation ────────────────────────────────────────────────────────

function gender(member: FamilyMember | undefined): 'male' | 'female' | 'other' {
  return member?.gender ?? 'other'
}

function isMale(m: FamilyMember | undefined) { return gender(m) === 'male' }
function isFemale(m: FamilyMember | undefined) { return gender(m) === 'female' }

function edgeSeq(edges: PathEdge[]): string {
  return edges.map(e => e.edge).join(',')
}

/**
 * Returns a human-readable relationship label.
 * e.g. "Father", "Paternal Uncle (Chacha)", "Father's Sister (Bua)"
 * Falls back to "X steps away" for unrecognised paths.
 */
export function computeRelationLabel(
  fromId: string,
  toId: string,
  members: FamilyMember[]
): string | null {
  const memberMap = new Map(members.map(m => [m.id, m]))
  const target = memberMap.get(toId)
  if (!target) return null

  const edges = findEdgePath(fromId, toId, members)
  if (edges === null) return null
  if (edges.length === 0) return 'Self'

  const seq = edgeSeq(edges)
  const male = isMale(target)
  const female = isFemale(target)

  // ── Direct 1-step ──────────────────────────────────────────────────────────
  if (seq === 'UP') return male ? 'Father' : female ? 'Mother' : 'Parent'
  if (seq === 'DOWN') return male ? 'Son' : female ? 'Daughter' : 'Child'
  if (seq === 'SPOUSE') return male ? 'Husband' : female ? 'Wife' : 'Spouse'

  // ── 2-step ─────────────────────────────────────────────────────────────────
  if (seq === 'UP,UP') return male ? 'Grandfather (Dada/Nana)' : female ? 'Grandmother (Dadi/Nani)' : 'Grandparent'
  if (seq === 'DOWN,DOWN') return male ? 'Grandson' : female ? 'Granddaughter' : 'Grandchild'

  if (seq === 'UP,DOWN') {
    // sibling (from→parent→child)
    return male ? 'Brother' : female ? 'Sister' : 'Sibling'
  }
  if (seq === 'DOWN,UP') {
    // child's parent = self OR step-parent; treat as sibling's path
    return male ? 'Brother' : female ? 'Sister' : 'Sibling'
  }
  if (seq === 'SPOUSE,UP') return male ? 'Father-in-law' : female ? 'Mother-in-law' : 'Parent-in-law'
  if (seq === 'SPOUSE,DOWN') return male ? 'Son-in-law' : female ? 'Daughter-in-law' : 'Child-in-law'
  if (seq === 'UP,SPOUSE') {
    // parent's spouse who is not your parent = step-parent
    return male ? 'Step-father' : female ? 'Step-mother' : 'Step-parent'
  }
  if (seq === 'DOWN,SPOUSE') return male ? 'Son-in-law' : female ? 'Daughter-in-law' : 'Child-in-law'
  if (seq === 'SPOUSE,SPOUSE') return 'Co-spouse (Sautan/Sauta)'

  // ── 3-step ─────────────────────────────────────────────────────────────────
  if (seq === 'UP,UP,UP') return male ? 'Great-grandfather' : female ? 'Great-grandmother' : 'Great-grandparent'
  if (seq === 'DOWN,DOWN,DOWN') return male ? 'Great-grandson' : female ? 'Great-granddaughter' : 'Great-grandchild'

  if (seq === 'UP,UP,DOWN') {
    // grandparent→child = parent's sibling = uncle/aunt
    return male ? 'Uncle (Chacha/Mama)' : female ? 'Aunt (Chachi/Mami)' : 'Uncle/Aunt'
  }
  if (seq === 'UP,DOWN,DOWN') {
    // parent→sibling→child = cousin
    return male ? 'Cousin (Bhai)' : female ? 'Cousin (Behen)' : 'Cousin'
  }
  if (seq === 'UP,UP,SPOUSE') {
    // grandparent's spouse = other grandparent
    return male ? 'Grandfather' : female ? 'Grandmother' : 'Grandparent'
  }
  if (seq === 'UP,SPOUSE,UP') {
    // parent → spouse → parent = parent-in-law of parent (step-grandparent-ish)
    return male ? 'Maternal Grandfather' : female ? 'Maternal Grandmother' : 'Grandparent (in-law)'
  }
  if (seq === 'UP,DOWN,SPOUSE') {
    // sibling's spouse
    return male ? "Brother's Husband / Jija" : female ? "Brother's Wife / Bhabhi" : "Sibling's Spouse"
  }
  if (seq === 'SPOUSE,UP,DOWN') {
    // spouse's sibling
    return male ? 'Brother-in-law (Saala/Devar)' : female ? 'Sister-in-law (Saali/Nanad)' : 'Sibling-in-law'
  }
  if (seq === 'SPOUSE,DOWN,DOWN') {
    return male ? 'Grandson (step)' : female ? 'Granddaughter (step)' : 'Step-grandchild'
  }
  if (seq === 'DOWN,UP,UP') {
    return male ? 'Grandfather' : female ? 'Grandmother' : 'Grandparent'
  }
  if (seq === 'UP,UP,DOWN,DOWN') {
    return male ? 'First Cousin (Bhai)' : female ? 'First Cousin (Behen)' : 'First Cousin'
  }
  if (seq === 'DOWN,DOWN,UP') {
    return male ? 'Nephew' : female ? 'Niece' : 'Nephew/Niece'
  }
  if (seq === 'UP,DOWN,UP') {
    // Uncle/Aunt → their parent = grandparent again
    return male ? 'Grandfather' : female ? 'Grandmother' : 'Grandparent'
  }
  if (seq === 'DOWN,SPOUSE,UP') {
    // child's spouse's parent = in-law
    return male ? 'Son-in-law\'s Father' : female ? 'Son-in-law\'s Mother' : 'In-law\'s Parent'
  }

  // ── Parent's sibling variants ───────────────────────────────────────────────
  // Distinguish paternal/maternal uncle-aunt by which parent
  if (edges.length === 3 && seq === 'UP,UP,DOWN') {
    const parentEdge = edges[0]
    const parent = memberMap.get(parentEdge.memberId)
    const gpEdge = edges[1]
    const gp = memberMap.get(gpEdge.memberId)
    if (parent && gp) {
      const paternalSide = gp.spouseIds.some(s => s === parent.id) || parent.parentIds.includes(gp.id)
      if (isMale(target)) return paternalSide ? 'Paternal Uncle (Chacha/Tau)' : 'Maternal Uncle (Mama)'
      if (isFemale(target)) return paternalSide ? 'Paternal Aunt (Bua)' : 'Maternal Aunt (Mausi/Mami)'
    }
    return male ? 'Uncle' : female ? 'Aunt' : 'Uncle/Aunt'
  }

  // ── Nephew / Niece ─────────────────────────────────────────────────────────
  if (seq === 'UP,DOWN,DOWN,DOWN' || seq === 'DOWN,UP,DOWN') {
    return male ? 'Nephew (Bhatija/Bhanja)' : female ? 'Niece (Bhatiji/Bhanji)' : 'Nephew/Niece'
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  const steps = edges.length
  return `${steps}-step relative`
}
