/**
 * Family Relationship Engine — Single Source of Truth
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ALL relationship inference in the app flows through this file.     ║
 * ║  UI components must call getRelationshipBetweenPeople() only.       ║
 * ║  No relationship logic belongs in dashboards, panels, or components.║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Architecture:
 *   members DB
 *       ↓
 *   buildRelationshipGraph()   — derives SIBLING edges from shared parentIds
 *       ↓
 *   findPath()                 — BFS shortest path (never DFS)
 *       ↓
 *   normalizeEdgePath()        — ['PARENT','SIBLING','CHILD'] → 'PARENT>SIBLING>CHILD'
 *       ↓
 *   RELATIONSHIP_MAP lookup    — 'PARENT>SIBLING>CHILD' → 'First Cousin'
 *       ↓
 *   getRelationshipBetweenPeople()  — single public API
 *
 * Edge types:
 *   PARENT   — child → parent (from parentIds)
 *   CHILD    — parent → child (bidirectional of PARENT)
 *   SPOUSE   — from spouseIds (bidirectional)
 *   SIBLING  — derived from shared parentIds; NEVER stored in DB
 *
 * Scalability: O(n·p) graph build, O(n) BFS per query.
 * Supports thousands of members, deep generations, complex in-law trees.
 *
 * This file also contains utility engines (inference suggestions,
 * inverse mapping, consistency validation) that are kept here for
 * co-location but are secondary to getRelationshipBetweenPeople().
 */

import type { FamilyMember } from './types'
import { RELATIONSHIP_MAP } from './relationship-map'

// ══════════════════════════════════════════════════════════════════════════════
// ── SECTION 1: CANONICAL GRAPH ENGINE ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────────────────

/** The four primitive edge types in the family graph. */
export type EdgeType = 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING'

interface GraphEdge {
  to: string
  type: EdgeType
}

/** Adjacency list: memberId → outgoing edges */
export type RelationshipGraph = Map<string, GraphEdge[]>

export interface GraphPath {
  /** Member IDs from fromId to toId (inclusive) */
  peoplePath: string[]
  /** Edge connecting peoplePath[i] to peoplePath[i+1] */
  edgePath: EdgeType[]
}

export interface RelationMetadata {
  /** Paternal/maternal based on gender of first PARENT-edge target */
  side: 'paternal' | 'maternal' | 'spouse' | 'mixed' | null
  /** blood = no SPOUSE edges; marriage = SPOUSE-only; mixed = both */
  type: 'blood' | 'marriage' | 'mixed'
  /** target.generation − from.generation (positive = target older) */
  generationDelta: number
  /** 1 = first cousin, 2 = second, null if not a cousin */
  cousinDegree: number | null
  /** 1 = once removed, 2 = twice, null otherwise */
  removedLevel: number | null
  /** Total BFS hops */
  hopCount: number
}

export interface RelationshipResultFound {
  found: true
  /** e.g. "First Cousin", "Paternal Uncle (Chacha/Tau)", "Co-sister" */
  relationship: string
  /** BFS edge sequence */
  path: EdgeType[]
  /** 'PARENT>SIBLING>CHILD' */
  normalized: string
  /** Member IDs in traversal order */
  people: string[]
  /** Per-hop step labels: ["Father", "Brother", "Son"] */
  semanticChain: string[]
  /** "Sanjay is your father's brother's son" */
  chainSentence: string
  metadata: RelationMetadata
  /** 0–1 confidence */
  confidence: number
}

export interface RelationshipResultNotFound {
  found: false
  relationship: ''
  path: never[]
  normalized: ''
  people: never[]
  semanticChain: never[]
  chainSentence: ''
  metadata: null
  confidence: 0
}

export type RelationshipResult = RelationshipResultFound | RelationshipResultNotFound

// ── Build graph ───────────────────────────────────────────────────────────────

/**
 * Converts FamilyMember[] into a bidirectional adjacency graph.
 *
 * Edges added:
 *   - PARENT / CHILD from member.parentIds (both directions)
 *   - SPOUSE from member.spouseIds (bidirectional, deduplicated)
 *   - SIBLING for every pair of members sharing ≥1 parentId (derived, not stored)
 *
 * Dangling references (IDs not present in members) are silently skipped.
 */
export function buildRelationshipGraph(members: FamilyMember[]): RelationshipGraph {
  const graph: RelationshipGraph = new Map()
  const memberIds = new Set(members.map(m => m.id))

  for (const m of members) graph.set(m.id, [])

  const addEdge = (from: string, to: string, type: EdgeType) => {
    if (!graph.has(from)) graph.set(from, [])
    graph.get(from)!.push({ to, type })
  }

  // PARENT / CHILD
  for (const m of members) {
    for (const pid of (m.parentIds ?? [])) {
      if (!memberIds.has(pid)) continue
      addEdge(m.id, pid, 'PARENT')
      addEdge(pid, m.id, 'CHILD')
    }
  }

  // SPOUSE (deduplicated — either side may store the link)
  const spouseSeen = new Set<string>()
  for (const m of members) {
    for (const sid of (m.spouseIds ?? [])) {
      if (!memberIds.has(sid)) continue
      const key = [m.id, sid].sort().join('|')
      if (spouseSeen.has(key)) continue
      spouseSeen.add(key)
      addEdge(m.id, sid, 'SPOUSE')
      addEdge(sid, m.id, 'SPOUSE')
    }
  }

  // SIBLING — derived from shared parentIds; the cornerstone of cousin inference
  const parentToChildren = new Map<string, string[]>()
  for (const m of members) {
    for (const pid of (m.parentIds ?? [])) {
      if (!memberIds.has(pid)) continue
      if (!parentToChildren.has(pid)) parentToChildren.set(pid, [])
      parentToChildren.get(pid)!.push(m.id)
    }
  }

  const sibSeen = new Set<string>()
  for (const children of parentToChildren.values()) {
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const key = [children[i], children[j]].sort().join('|')
        if (sibSeen.has(key)) continue
        sibSeen.add(key)
        addEdge(children[i], children[j], 'SIBLING')
        addEdge(children[j], children[i], 'SIBLING')
      }
    }
  }

  return graph
}

// ── BFS traversal ─────────────────────────────────────────────────────────────

/**
 * Finds the SHORTEST path between two nodes using BFS.
 * BFS guarantees the minimal hop-count path, which corresponds to the
 * closest family relationship (not necessarily the simplest label).
 *
 * Returns null when the two nodes are not connected.
 */
export function findPath(graph: RelationshipGraph, fromId: string, toId: string): GraphPath | null {
  if (fromId === toId) return { peoplePath: [fromId], edgePath: [] }
  if (!graph.has(fromId) || !graph.has(toId)) return null

  const parent = new Map<string, { from: string; via: EdgeType } | null>([[fromId, null]])
  const queue: string[] = [fromId]

  outer: while (queue.length > 0) {
    const cur = queue.shift()!
    for (const { to, type } of (graph.get(cur) ?? [])) {
      if (!parent.has(to)) {
        parent.set(to, { from: cur, via: type })
        if (to === toId) break outer
        queue.push(to)
      }
    }
  }

  if (!parent.has(toId)) return null

  // Reconstruct path by following parent pointers
  const peoplePath: string[] = []
  const edgePath: EdgeType[] = []
  let cur = toId
  while (cur !== fromId) {
    peoplePath.unshift(cur)
    const step = parent.get(cur)
    if (!step) return null
    edgePath.unshift(step.via)
    cur = step.from
  }
  peoplePath.unshift(fromId)

  return { peoplePath, edgePath }
}

// ── Path normalization ─────────────────────────────────────────────────────────

/** ['PARENT', 'SIBLING', 'CHILD'] → 'PARENT>SIBLING>CHILD' */
export function normalizeEdgePath(edgePath: EdgeType[]): string {
  return edgePath.join('>')
}

// ── LCA-based structural classifier ──────────────────────────────────────────
//
// Pure ancestry analysis: ignores SPOUSE edges entirely and only traverses
// the parent-child hierarchy. This lets us classify blood relationships with
// exact degree precision from graph position alone, independent of whether
// SIBLING edges were explicitly derived or the relationship label was set.
//
// Key concepts:
//   depthA = hops from `fromId` UP to the LCA (via PARENT-only BFS)
//   depthB = hops from `toId`   UP to the LCA (via PARENT-only BFS)
//   LCA itself = the shallowest ancestor shared by both nodes.
//
// Classification table:
//   depthA=0, depthB=0  → same person (should have been caught earlier)
//   depthA=0, depthB>0  → toId is a descendant: Child / Grandchild / Great-grandchild…
//   depthA>0, depthB=0  → toId is an ancestor: Parent / Grandparent…
//   depthA=1, depthB=1  → Sibling (same parent)
//   depthA=2, depthB=1  → Uncle / Aunt  (fromId's grandparent = toId's parent)
//   depthA=1, depthB=2  → Nephew / Niece (inverse)
//   depthA≥2, depthB≥2  → Cousin:
//                           degree   = min(depthA, depthB) − 1
//                           removed  = |depthA − depthB|
//                           degree=1 → First Cousin; degree=2 → Second Cousin…

interface LCAResult {
  lcaId: string
  depthA: number  // hops from fromId to LCA
  depthB: number  // hops from toId to LCA
  /** Full ancestor set of fromId (id → hops). Carried so classifyFromLCA can
   *  find the "pathway parent" — fromId's direct parent that lies on the path
   *  to the LCA — and use its gender for paternal/maternal disambiguation. */
  ancestorsA: Map<string, number>
  /** Full ancestor set of toId (id → hops). Used together with ancestorsA to
   *  identify which of fromId's parents is the CORRECT pathway parent toward
   *  the LCA, avoiding the wrong pick when both parents are in the tree. */
  ancestorsB: Map<string, number>
}

/**
 * BFS upward through PARENT-only edges from `startId`.
 * Returns a Map<ancestorId, depth> where depth is the number of hops.
 * Depth 0 = the node itself.
 * Caps at 20 generations to guard against circular references in bad data.
 */
function buildAncestorSet(graph: RelationshipGraph, startId: string): Map<string, number> {
  const ancestors = new Map<string, number>([[startId, 0]])
  const queue = [startId]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    const depth = ancestors.get(cur)!
    if (depth >= 20) continue
    for (const { to, type } of (graph.get(cur) ?? [])) {
      if (type !== 'PARENT') continue
      if (ancestors.has(to)) continue
      ancestors.set(to, depth + 1)
      queue.push(to)
    }
  }
  return ancestors
}

/**
 * Finds the Lowest Common Ancestor of two nodes in the PARENT-only ancestry
 * graph. "Lowest" means the shallowest combined depth (depthA + depthB),
 * which corresponds to the most recent common ancestor.
 *
 * Returns null when no common ancestor exists (disconnected nodes or
 * relationship only through marriage/SPOUSE edges).
 */
function findLCA(
  graph: RelationshipGraph,
  fromId: string,
  toId: string,
): LCAResult | null {
  const ancestorsA = buildAncestorSet(graph, fromId)
  const ancestorsB = buildAncestorSet(graph, toId)

  let best: { lcaId: string; depthA: number; depthB: number } | null = null
  for (const [id, dA] of ancestorsA) {
    const dB = ancestorsB.get(id)
    if (dB === undefined) continue
    // Prefer the candidate with lowest combined depth (closest LCA)
    if (!best || (dA + dB) < (best.depthA + best.depthB)) {
      best = { lcaId: id, depthA: dA, depthB: dB }
    }
  }
  return best ? { ...best, ancestorsA, ancestorsB } : null
}

/**
 * Derives a precise relationship label from LCA depths.
 *
 * `male`/`female` refer to the gender of `toId` (the relationship target).
 *
 * `memberMap` is optional — when supplied it enables:
 *   • Paternal/Maternal uncle-aunt disambiguation by looking up the gender of
 *     fromId's direct parent (the "pathway parent" between fromId and the LCA).
 *   • Gendered first-cousin labels ("First Cousin (Bhai)" / "First Cousin (Behen)")
 *     that are recognised by the cultural-terms lookup.
 *
 * Classification table:
 *   depthA>0, depthB=0  → toId is fromId's ancestor
 *   depthA=0, depthB>0  → toId is fromId's descendant
 *   d1=1, d2=1          → Sibling
 *   d1=2, d2=1          → Uncle / Aunt  (+ paternal/maternal if memberMap available)
 *   d1=1, d2=2          → Nephew / Niece
 *   d1=3, d2=1 / d1=1, d2=3 → Great-uncle/aunt / Grand-nephew/niece
 *   d1≥2, d2≥2         → First/Second… Cousin [, N times removed]
 */
function classifyFromLCA(
  lca: LCAResult,
  male: boolean,
  female: boolean,
  memberMap?: Map<string, FamilyMember>,
  peoplePath?: string[],
): string {
  const { depthA, depthB, lcaId, ancestorsA } = lca

  /**
   * Returns fromId's direct parent that lies on the BFS path toward toId.
   *
   * Priority order:
   *   1. peoplePath[1] — the exact node BFS traversed as the first hop.
   *      This is always correct and requires no heuristic.
   *      peoplePath is available when resolveLabel passes it through.
   *   2. Ancestor-set heuristic (fallback for call sites without peoplePath):
   *      find the depth-1 ancestor of fromId whose parentIds include the LCA.
   *      When both parents are in the tree this can still be ambiguous, but
   *      peoplePath should always be provided so this is only a safety net.
   */
  const pathwayParent = (): FamilyMember | null => {
    if (!memberMap) return null
    // Primary: use the exact BFS intermediate node
    if (peoplePath && peoplePath.length >= 2) {
      const p = memberMap.get(peoplePath[1])
      if (p && !p.id.startsWith('__virt_')) return p
    }
    // Fallback: ancestor-set heuristic
    for (const [pid, depth] of ancestorsA) {
      if (depth !== 1) continue
      const p = memberMap.get(pid)
      if (!p || p.id.startsWith('__virt_')) continue
      if (p.parentIds.includes(lcaId)) return p
    }
    return null
  }

  // ── toId is an ancestor of fromId ──────────────────────────────────────────
  if (depthA > 0 && depthB === 0) {
    if (depthA === 1) return male ? 'Father' : female ? 'Mother' : 'Parent'
    if (depthA === 2) {
      // Grandparent — use pathway parent gender for paternal/maternal
      const pp = pathwayParent()
      const pM = pp ? isMale(pp) : false, pF = pp ? isFemale(pp) : false
      if (male) return pM ? 'Paternal Grandfather' : pF ? 'Maternal Grandfather' : 'Grandfather'
      if (female) return pM ? 'Paternal Grandmother' : pF ? 'Maternal Grandmother' : 'Grandmother'
      return 'Grandparent'
    }
    const greats = 'Great-'.repeat(depthA - 2)
    return male ? `${greats}grandfather` : female ? `${greats}grandmother` : `${greats}grandparent`
  }

  // ── toId is a descendant of fromId ─────────────────────────────────────────
  if (depthA === 0 && depthB > 0) {
    if (depthB === 1) return male ? 'Son' : female ? 'Daughter' : 'Child'
    if (depthB === 2) return male ? 'Grandson' : female ? 'Granddaughter' : 'Grandchild'
    const greats = 'Great-'.repeat(depthB - 2)
    return male ? `${greats}grandson` : female ? `${greats}granddaughter` : `${greats}grandchild`
  }

  // ── Sibling ────────────────────────────────────────────────────────────────
  if (depthA === 1 && depthB === 1) {
    return male ? 'Brother' : female ? 'Sister' : 'Sibling'
  }

  // ── Uncle / Aunt ───────────────────────────────────────────────────────────
  // depthA=2: fromId → parent (pathway parent) → LCA (grandparent)
  // depthB=1: toId   → LCA (parent of toId)
  // ∴ toId is a child of LCA, i.e. toId is fromId's parent's sibling → Uncle/Aunt.
  // Paternal/Maternal: determined by the gender of fromId's pathway parent.
  if (depthA === 2 && depthB === 1) {
    const pp = pathwayParent()
    const pM = pp ? isMale(pp) : false, pF = pp ? isFemale(pp) : false
    if (male) return pM ? 'Paternal Uncle (Chacha/Tau)' : pF ? 'Maternal Uncle (Mama)' : 'Uncle'
    if (female) return pM ? 'Paternal Aunt (Bua)' : pF ? 'Maternal Aunt (Mausi/Mami)' : 'Aunt'
    return 'Uncle/Aunt'
  }

  // ── Nephew / Niece ─────────────────────────────────────────────────────────
  // depthA=1: fromId → LCA (fromId's parent)
  // depthB=2: toId   → sibling of fromId → LCA
  // ∴ toId is a child of fromId's sibling → Nephew/Niece.
  if (depthA === 1 && depthB === 2) {
    return male ? 'Nephew' : female ? 'Niece' : 'Nephew/Niece'
  }

  // ── Great-uncle / Great-aunt ───────────────────────────────────────────────
  if (depthA === 3 && depthB === 1) {
    return male ? 'Great-uncle' : female ? 'Great-aunt' : 'Great-uncle/aunt'
  }
  if (depthA === 1 && depthB === 3) {
    return male ? 'Grand-nephew' : female ? 'Grand-niece' : 'Grand-nephew/niece'
  }
  // Deeper great-uncle/aunt / grand-nephew/niece chains
  if (depthB === 1 && depthA > 3) {
    const greats = 'Great-'.repeat(depthA - 2)
    return male ? `${greats}uncle` : female ? `${greats}aunt` : `${greats}uncle/aunt`
  }
  if (depthA === 1 && depthB > 3) {
    const greats = 'Great-'.repeat(depthB - 2)
    return male ? `${greats}nephew` : female ? `${greats}niece` : `${greats}nephew/niece`
  }

  // ── Cousin formula (general case, depthA≥2 and depthB≥2) ─────────────────
  // Cousin degree = min(depthA, depthB) − 1
  // Times removed = |depthA − depthB|
  const degree = Math.min(depthA, depthB) - 1
  const removed = Math.abs(depthA - depthB)
  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh']
  const ordinal = ordinals[degree - 1] ?? `${degree}th`

  if (degree === 1) {
    // Use gendered label for first cousins — these are pre-mapped in LABEL_TO_KEY
    // ('First Cousin (Bhai)' → 'first_cousin', 'First Cousin (Behen)' → 'first_cousin')
    const base = male ? 'First Cousin (Bhai)' : female ? 'First Cousin (Behen)' : 'First Cousin'
    return removed === 0 ? base : `${base}, ${removed} time${removed > 1 ? 's' : ''} removed`
  }

  const base = `${ordinal} Cousin`
  return removed === 0 ? base : `${base}, ${removed} time${removed > 1 ? 's' : ''} removed`
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function isMale(m?: FamilyMember) { return m?.gender === 'male' }
function isFemale(m?: FamilyMember) { return m?.gender === 'female' }

function edgeStepLabel(type: EdgeType, target: FamilyMember): string {
  const m = isMale(target), f = isFemale(target)
  if (type === 'PARENT') return m ? 'Father' : f ? 'Mother' : 'Parent'
  if (type === 'CHILD') return m ? 'Son' : f ? 'Daughter' : 'Child'
  if (type === 'SIBLING') return m ? 'Brother' : f ? 'Sister' : 'Sibling'
  /* SPOUSE */            return m ? 'Husband' : f ? 'Wife' : 'Spouse'
}

function edgeArrowLabel(type: EdgeType): string {
  if (type === 'PARENT') return '↑'
  if (type === 'CHILD') return '↓'
  if (type === 'SIBLING') return '↔'
  /* SPOUSE */            return '↔'
}

/**
 * Resolves the final human-readable label from the normalized edge sequence.
 *
 * Resolution order:
 *   1. Special-case paternal/maternal uncle-aunt from BFS path (uses intermediate
 *      node gender directly from peoplePath, fastest and most accurate).
 *   2. LCA-based structural classification — derives the label purely from ancestry
 *      graph position (depthA/depthB). Correctly handles all cousin degrees, removed
 *      cousins, uncle/aunt/nephew/niece, and ancestor/descendant chains even when
 *      SIBLING edges are absent (virtual-node paths). Fires only on blood-line paths
 *      (no SPOUSE edge). Ancestor set carried in `lca.ancestorsA` enables
 *      paternal/maternal disambiguation for uncle/aunt and grandparent cases.
 *   3. Static RELATIONSHIP_MAP lookup for exact canonical labels.
 *   4. deriveDynamicLabel as structural fallback.
 */
function resolveLabel(
  normalized: string,
  peoplePath: string[],
  memberMap: Map<string, FamilyMember>,
  lca?: LCAResult | null,
): string {
  const target = memberMap.get(peoplePath[peoplePath.length - 1])
  const male = isMale(target)
  const female = isFemale(target)

  // 1. Paternal/maternal uncle-aunt from BFS path (intermediate node gender available)
  if (normalized === 'PARENT>SIBLING' || normalized === 'PARENT>PARENT>CHILD') {
    const intermediateParent = memberMap.get(peoplePath[1])
    if (intermediateParent) {
      const pM = isMale(intermediateParent), pF = isFemale(intermediateParent)
      if (male) return pM ? 'Paternal Uncle (Chacha/Tau)' : pF ? 'Maternal Uncle (Mama)' : 'Uncle'
      if (female) return pM ? 'Paternal Aunt (Bua)' : pF ? 'Maternal Aunt (Mausi/Mami)' : 'Aunt'
    }
    return male ? 'Uncle' : female ? 'Aunt' : 'Uncle/Aunt'
  }

  // 2. LCA-based classification — only for blood-line paths (no SPOUSE edges).
  //    peoplePath is forwarded so classifyFromLCA can use peoplePath[1] as the
  //    exact pathway parent instead of relying on the ancestor-set heuristic.
  const hasSpouse = normalized.includes('SPOUSE')
  if (!hasSpouse && lca) {
    const label = classifyFromLCA(lca, male, female, memberMap, peoplePath)
    dbg(`LCA: ${lca.lcaId} depthA=${lca.depthA} depthB=${lca.depthB} → "${label}"`)
    return label
  }

  // 3. Static map
  const entry = RELATIONSHIP_MAP[normalized]
  if (entry) {
    if (male && entry.male) return entry.male
    if (female && entry.female) return entry.female
    return entry.neutral
  }

  // 4. Dynamic derivation fallback
  return deriveDynamicLabel(normalized, male, female)
}

/**
 * Derives a human-readable relationship label from an edge-path sequence
 * that isn't present in RELATIONSHIP_MAP.  Handles:
 *   • Pure ancestor chains (all PARENT)  → "Nth Great-grandparent"
 *   • Pure descendant chains (all CHILD) → "Nth Great-grandchild"
 *   • General cousin formula             → "Kth Cousin, M times removed"
 *   • Arbitrary long paths               → "N-step relative" (final fallback)
 */
function deriveDynamicLabel(normalized: string, male: boolean, female: boolean): string {
  const edges = normalized.split('>')

  // Pure ancestor chain: PARENT×n
  if (edges.every(e => e === 'PARENT')) {
    const n = edges.length
    if (n === 2) return male ? 'Grandfather' : female ? 'Grandmother' : 'Grandparent'
    if (n === 3) return male ? 'Great-grandfather' : female ? 'Great-grandmother' : 'Great-grandparent'
    const greats = 'Great-'.repeat(n - 2)
    return male ? `${greats}grandfather` : female ? `${greats}grandmother` : `${greats}grandparent`
  }

  // Pure descendant chain: CHILD×n
  if (edges.every(e => e === 'CHILD')) {
    const n = edges.length
    if (n === 2) return male ? 'Grandson' : female ? 'Granddaughter' : 'Grandchild'
    if (n === 3) return male ? 'Great-grandson' : female ? 'Great-granddaughter' : 'Great-grandchild'
    const greats = 'Great-'.repeat(n - 2)
    return male ? `${greats}grandson` : female ? `${greats}granddaughter` : `${greats}grandchild`
  }

  // General cousin formula: any path containing exactly one SIBLING edge
  // and at least one PARENT and one CHILD on either side.
  // Pattern: PARENT×p > SIBLING > CHILD×c (virtual SIBLING may also appear mid-path)
  const sibIdx = edges.indexOf('SIBLING')
  if (sibIdx !== -1) {
    const up = edges.slice(0, sibIdx)
    const down = edges.slice(sibIdx + 1)
    const allUp = up.every(e => e === 'PARENT')
    const allDown = down.every(e => e === 'CHILD')
    if (allUp && allDown && up.length >= 1 && down.length >= 1) {
      const degree = Math.min(up.length, down.length)          // cousin degree
      const removed = Math.abs(up.length - down.length)        // times removed
      const ordinal = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][degree - 1] ?? `${degree}th`
      const base = `${ordinal} Cousin`
      return removed === 0 ? base : `${base}, ${removed} time${removed > 1 ? 's' : ''} removed`
    }
  }

  // Ancestor-then-descendant without SIBLING (PARENT×p > CHILD×c, p≠c)
  const firstChild = edges.indexOf('CHILD')
  if (firstChild > 0 && edges.slice(firstChild).every(e => e === 'CHILD') &&
    edges.slice(0, firstChild).every(e => e === 'PARENT')) {
    const upCount = firstChild
    const downCount = edges.length - firstChild
    if (upCount === downCount) {
      // Same-generation across branches — generic sibling-like
      return `${upCount + downCount}-step relative`
    }
    if (downCount > upCount) {
      const n = downCount - upCount
      const greats = n > 2 ? 'Great-'.repeat(n - 2) : ''
      if (n === 1) return male ? 'Nephew' : female ? 'Niece' : 'Nephew/Niece'
      return male ? `${greats}Grand-nephew` : female ? `${greats}Grand-niece` : `${greats}Grand-nephew/niece`
    }
    // upCount > downCount
    const n = upCount - downCount
    const greats = n > 2 ? 'Great-'.repeat(n - 2) : ''
    if (n === 1) return male ? 'Uncle' : female ? 'Aunt' : 'Uncle/Aunt'
    return male ? `${greats}Grand-uncle` : female ? `${greats}Grand-aunt` : `${greats}Grand-uncle/aunt`
  }

  // Final fallback
  return `${edges.length}-step relative`
}

// ── Chain builders ────────────────────────────────────────────────────────────

function buildSemanticChain(edgePath: EdgeType[], peoplePath: string[], memberMap: Map<string, FamilyMember>): string[] {
  return edgePath.map((type, i) => {
    const target = memberMap.get(peoplePath[i + 1])
    return target ? edgeStepLabel(type, target) : String(type)
  })
}

function buildChainSentence(
  edgePath: EdgeType[],
  peoplePath: string[],
  memberMap: Map<string, FamilyMember>,
  fromLabel: string,
): string {
  const target = memberMap.get(peoplePath[peoplePath.length - 1])
  const toName = target?.name?.split(' ')[0] ?? 'They'
  if (edgePath.length === 0) return `${toName} is ${fromLabel}.`

  // Build "father's brother's" prefix then final target label
  const steps: string[] = []
  for (let i = 0; i < edgePath.length - 1; i++) {
    const node = memberMap.get(peoplePath[i + 1])
    if (node) steps.push(edgeStepLabel(edgePath[i], node).toLowerCase())
  }
  const lastLabel = edgeStepLabel(edgePath[edgePath.length - 1], target!).toLowerCase()

  if (steps.length === 0) return `${toName} is ${fromLabel} ${lastLabel}.`
  const chain = `${fromLabel} ${steps.join("'s ")}`
  return `${toName} is ${chain}'s ${lastLabel}.`
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function computeMetadata(
  edgePath: EdgeType[],
  peoplePath: string[],
  memberMap: Map<string, FamilyMember>,
  lca?: LCAResult | null,
): RelationMetadata {
  const from = memberMap.get(peoplePath[0])
  const to = memberMap.get(peoplePath[peoplePath.length - 1])

  // Side: derived from the first PARENT hop's target gender
  let side: RelationMetadata['side'] = null
  if (edgePath[0] === 'SPOUSE') {
    side = 'spouse'
  } else if (edgePath[0] === 'PARENT') {
    const firstParent = memberMap.get(peoplePath[1])
    side = firstParent ? (isMale(firstParent) ? 'paternal' : isFemale(firstParent) ? 'maternal' : null) : null
  }
  const hasMarriage = edgePath.some(e => e === 'SPOUSE')
  const hasBlood = edgePath.some(e => e !== 'SPOUSE')
  if (hasMarriage && hasBlood && (side === 'paternal' || side === 'maternal')) side = 'mixed'

  const type: RelationMetadata['type'] = hasBlood && hasMarriage ? 'mixed' : hasMarriage ? 'marriage' : 'blood'

  const generationDelta = (to?.generation ?? 0) - (from?.generation ?? 0)

  // Cousin degree: prefer LCA-derived depths (structurally accurate) over edge-pattern counting.
  // Edge-pattern counting can miscount when SIBLING edges route through virtual nodes.
  let cousinDegree: number | null = null
  let removedLevel: number | null = null

  if (lca && lca.depthA >= 2 && lca.depthB >= 2) {
    // Both nodes share an ancestor at depth ≥ 2 → cousin relationship
    cousinDegree = Math.min(lca.depthA, lca.depthB) - 1
    const diff = Math.abs(lca.depthA - lca.depthB)
    removedLevel = diff > 0 ? diff : null
  } else {
    // Fallback to edge counting when LCA not available (e.g. marriage path)
    const upCount = edgePath.filter(e => e === 'PARENT').length
    const downCount = edgePath.filter(e => e === 'CHILD').length
    const sibCount = edgePath.filter(e => e === 'SIBLING').length
    if (sibCount === 1 && upCount >= 1 && downCount >= 1) {
      cousinDegree = upCount
      const diff = Math.abs(upCount - downCount)
      removedLevel = diff > 0 ? diff : null
    }
  }

  return { side, type, generationDelta, cousinDegree, removedLevel, hopCount: edgePath.length }
}

// ── Confidence ────────────────────────────────────────────────────────────────

function computeConfidence(normalized: string, edgePath: EdgeType[], lca?: LCAResult | null): number {
  // LCA-derived labels have structural certainty — boost their confidence.
  const hasSpouse = normalized.includes('SPOUSE')
  if (!hasSpouse && lca) {
    // Structurally confirmed via LCA: scale confidence by combined depth (closer = higher)
    const totalDepth = lca.depthA + lca.depthB
    return Math.max(0.72, 1 - totalDepth * 0.04)
  }
  const inDict = normalized in RELATIONSHIP_MAP
  if (!inDict) return Math.max(0.3, 1 - edgePath.length * 0.08)
  return Math.max(0.72, 1 - edgePath.length * 0.04)
}

// ── Debug logging ─────────────────────────────────────────────────────────────

const IS_DEV = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'
function dbg(...args: unknown[]) { if (IS_DEV) console.debug('[relationship-engine]', ...args) }

// ── Public API ────────────────────────────────────────────────────────────────

const NOT_FOUND: RelationshipResultNotFound = {
  found: false, relationship: '', path: [], normalized: '', people: [],
  semanticChain: [], chainSentence: '', metadata: null, confidence: 0,
}

/**
 * THE single source of truth for relationship inference.
 *
 * Builds a graph from raw DB members, runs BFS to find the shortest path,
 * maps it through the canonical RELATIONSHIP_MAP, and returns a fully
 * annotated result with chain sentence, metadata, and confidence.
 *
 * @param members   Raw FamilyMember[] from the DB / React store
 * @param fromId    Starting member ID
 * @param toId      Target member ID
 * @param fromLabel Optional display label for 'from' ("your" when fromId = self)
 */
export function getRelationshipBetweenPeople(
  members: FamilyMember[],
  fromId: string,
  toId: string,
  fromLabel?: string,
): RelationshipResult {
  if (!fromId || !toId || fromId === toId) return NOT_FOUND

  const memberMap = new Map(members.map(m => [m.id, m]))
  if (!memberMap.has(fromId) || !memberMap.has(toId)) return NOT_FOUND

  dbg(`query: ${memberMap.get(fromId)?.name} → ${memberMap.get(toId)?.name}`)

  const graph = buildRelationshipGraph(members)

  if (IS_DEV) {
    dbg('graph size:', graph.size, 'nodes')
    const sample = [...graph.entries()].slice(0, 5)
    dbg('sample edges:', sample.map(([k, v]) =>
      `${memberMap.get(k)?.name ?? k}: [${v.map(e => `${e.type}→${memberMap.get(e.to)?.name ?? e.to}`).join(', ')}]`
    ))
  }

  const pathResult = findPath(graph, fromId, toId)
  if (!pathResult || pathResult.edgePath.length === 0) {
    dbg('no path found')
    return NOT_FOUND
  }

  dbg('BFS path:', pathResult.peoplePath.map(id => memberMap.get(id)?.name ?? id).join(' → '))
  dbg('edge path:', pathResult.edgePath.join(' → '))

  const normalized = normalizeEdgePath(pathResult.edgePath)
  dbg('normalized:', normalized)

  // Run LCA once here so both resolveLabel and computeMetadata can share it.
  // resolveLabel no longer calls findLCA itself — it receives the pre-computed result.
  const hasSpousePath = normalized.includes('SPOUSE')
  const lca = !hasSpousePath ? findLCA(graph, fromId, toId) : null

  const relationship = resolveLabel(normalized, pathResult.peoplePath, memberMap, lca)
  dbg('relationship:', relationship)

  const effectiveFromLabel = fromLabel ?? (memberMap.get(fromId)?.name?.split(' ')[0] ?? 'their')
  const semanticChain = buildSemanticChain(pathResult.edgePath, pathResult.peoplePath, memberMap)
  const chainSentence = buildChainSentence(pathResult.edgePath, pathResult.peoplePath, memberMap, effectiveFromLabel)
  const metadata = computeMetadata(pathResult.edgePath, pathResult.peoplePath, memberMap, lca)
  const confidence = computeConfidence(normalized, pathResult.edgePath, lca)

  return {
    found: true,
    relationship,
    path: pathResult.edgePath,
    normalized,
    people: pathResult.peoplePath,
    semanticChain,
    chainSentence,
    metadata,
    confidence,
  }
}

/** Edge type to display arrow (for UI path-chain connectors) */
export { edgeArrowLabel }

// ── Compatibility re-exports used by lib/relation-engine.ts shim ──────────────
// (These are not part of the public API — use getRelationshipBetweenPeople instead)
export { resolveLabel as _resolveLabel, edgeStepLabel as _edgeStepLabel }

// ══════════════════════════════════════════════════════════════════════════════
// ── SECTION 2: INVERSE RELATIONSHIP MAP ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ─── Inverse relationship map ──────────────────────────────────────────────

/**
 * Given a relationship label and the gender of the OTHER person
 * (the one who would "receive" the inverse), returns the inverse label.
 *
 * Example:
 *   getInverseRelationship('father', 'male')   → 'son'
 *   getInverseRelationship('father', 'female') → 'daughter'
 *   getInverseRelationship('brother', 'male')  → 'brother'
 *   getInverseRelationship('brother', 'female')→ 'sister'
 */

type InverseSpec = { male: string; female: string; neutral: string }

const INVERSE_MAP: Record<string, InverseSpec> = {
  // ── Parent / Child ──────────────────────────────────────────────────────
  'father': { male: 'son', female: 'daughter', neutral: 'child' },
  'mother': { male: 'son', female: 'daughter', neutral: 'child' },
  'parent': { male: 'son', female: 'daughter', neutral: 'child' },
  'son': { male: 'father', female: 'mother', neutral: 'parent' },
  'daughter': { male: 'father', female: 'mother', neutral: 'parent' },
  'child': { male: 'father', female: 'mother', neutral: 'parent' },
  // ── Grandparent / Grandchild ────────────────────────────────────────────
  'grandfather': { male: 'grandson', female: 'granddaughter', neutral: 'grandchild' },
  'grandmother': { male: 'grandson', female: 'granddaughter', neutral: 'grandchild' },
  'paternal-grandfather': { male: 'grandson', female: 'granddaughter', neutral: 'grandchild' },
  'paternal-grandmother': { male: 'grandson', female: 'granddaughter', neutral: 'grandchild' },
  'maternal-grandfather': { male: 'grandson', female: 'granddaughter', neutral: 'grandchild' },
  'maternal-grandmother': { male: 'grandson', female: 'granddaughter', neutral: 'grandchild' },
  'great-grandfather': { male: 'great-grandson', female: 'great-granddaughter', neutral: 'great-grandchild' },
  'great-grandmother': { male: 'great-grandson', female: 'great-granddaughter', neutral: 'great-grandchild' },
  'grandson': { male: 'grandfather', female: 'grandmother', neutral: 'grandparent' },
  'granddaughter': { male: 'grandfather', female: 'grandmother', neutral: 'grandparent' },
  'great-grandson': { male: 'great-grandfather', female: 'great-grandmother', neutral: 'great-grandparent' },
  'great-granddaughter': { male: 'great-grandfather', female: 'great-grandmother', neutral: 'great-grandparent' },
  // ── Siblings ────────────────────────────────────────────────────────────
  'brother': { male: 'brother', female: 'sister', neutral: 'sibling' },
  'sister': { male: 'brother', female: 'sister', neutral: 'sibling' },
  'sibling': { male: 'brother', female: 'sister', neutral: 'sibling' },
  'half-brother': { male: 'half-brother', female: 'half-sister', neutral: 'half-sibling' },
  'half-sister': { male: 'half-brother', female: 'half-sister', neutral: 'half-sibling' },
  'stepbrother': { male: 'stepbrother', female: 'stepsister', neutral: 'step-sibling' },
  'stepsister': { male: 'stepbrother', female: 'stepsister', neutral: 'step-sibling' },
  // ── Spouse ──────────────────────────────────────────────────────────────
  'husband': { male: 'husband', female: 'wife', neutral: 'spouse' },
  'wife': { male: 'husband', female: 'wife', neutral: 'spouse' },
  'spouse': { male: 'husband', female: 'wife', neutral: 'spouse' },
  'partner': { male: 'partner', female: 'partner', neutral: 'partner' },
  'ex-husband': { male: 'ex-husband', female: 'ex-wife', neutral: 'ex-spouse' },
  'ex-wife': { male: 'ex-husband', female: 'ex-wife', neutral: 'ex-spouse' },
  // ── Step-parent / Step-child ────────────────────────────────────────────
  'stepfather': { male: 'stepson', female: 'stepdaughter', neutral: 'stepchild' },
  'stepmother': { male: 'stepson', female: 'stepdaughter', neutral: 'stepchild' },
  'stepson': { male: 'stepfather', female: 'stepmother', neutral: 'stepparent' },
  'stepdaughter': { male: 'stepfather', female: 'stepmother', neutral: 'stepparent' },
  // ── Adopted ─────────────────────────────────────────────────────────────
  'adopted-son': { male: 'adoptive-father', female: 'adoptive-mother', neutral: 'adoptive-parent' },
  'adopted-daughter': { male: 'adoptive-father', female: 'adoptive-mother', neutral: 'adoptive-parent' },
  // ── Aunt / Uncle ────────────────────────────────────────────────────────
  'uncle': { male: 'nephew', female: 'niece', neutral: 'nephew/niece' },
  'aunt': { male: 'nephew', female: 'niece', neutral: 'nephew/niece' },
  'paternal-uncle': { male: 'nephew', female: 'niece', neutral: 'nephew/niece' },
  'paternal-aunt': { male: 'nephew', female: 'niece', neutral: 'nephew/niece' },
  'maternal-uncle': { male: 'nephew', female: 'niece', neutral: 'nephew/niece' },
  'maternal-aunt': { male: 'nephew', female: 'niece', neutral: 'nephew/niece' },
  'uncle-in-law': { male: 'nephew', female: 'niece', neutral: 'nephew/niece' },
  'aunt-in-law': { male: 'nephew', female: 'niece', neutral: 'nephew/niece' },
  'great-uncle': { male: 'great-nephew', female: 'great-niece', neutral: 'great-nephew/niece' },
  'great-aunt': { male: 'great-nephew', female: 'great-niece', neutral: 'great-nephew/niece' },
  // ── Nephew / Niece ──────────────────────────────────────────────────────
  'nephew': { male: 'uncle', female: 'aunt', neutral: 'uncle/aunt' },
  'niece': { male: 'uncle', female: 'aunt', neutral: 'uncle/aunt' },
  'grand-nephew': { male: 'great-uncle', female: 'great-aunt', neutral: 'great-uncle/aunt' },
  'grand-niece': { male: 'great-uncle', female: 'great-aunt', neutral: 'great-uncle/aunt' },
  // ── In-laws ─────────────────────────────────────────────────────────────
  'father-in-law': { male: 'son-in-law', female: 'daughter-in-law', neutral: 'child-in-law' },
  'mother-in-law': { male: 'son-in-law', female: 'daughter-in-law', neutral: 'child-in-law' },
  'son-in-law': { male: 'father-in-law', female: 'mother-in-law', neutral: 'parent-in-law' },
  'daughter-in-law': { male: 'father-in-law', female: 'mother-in-law', neutral: 'parent-in-law' },
  'brother-in-law': { male: 'brother-in-law', female: 'sister-in-law', neutral: 'sibling-in-law' },
  'sister-in-law': { male: 'brother-in-law', female: 'sister-in-law', neutral: 'sibling-in-law' },
  // ── Cousins ─────────────────────────────────────────────────────────────
  'first-cousin': { male: 'first-cousin', female: 'first-cousin', neutral: 'first-cousin' },
  'second-cousin': { male: 'second-cousin', female: 'second-cousin', neutral: 'second-cousin' },
  'third-cousin': { male: 'third-cousin', female: 'third-cousin', neutral: 'third-cousin' },
  'first-cousin-once-removed': { male: 'first-cousin-once-removed', female: 'first-cousin-once-removed', neutral: 'first-cousin-once-removed' },
  'cousin-in-law': { male: 'cousin-in-law', female: 'cousin-in-law', neutral: 'cousin-in-law' },
  // ── Godparent ───────────────────────────────────────────────────────────
  'godfather': { male: 'godson', female: 'goddaughter', neutral: 'godchild' },
  'godmother': { male: 'godson', female: 'goddaughter', neutral: 'godchild' },
  'godson': { male: 'godfather', female: 'godmother', neutral: 'godparent' },
  'goddaughter': { male: 'godfather', female: 'godmother', neutral: 'godparent' },
}

export function getInverseRelationship(
  relationship: string,
  recipientGender: FamilyMember['gender'],
): string {
  const key = relationship.toLowerCase().trim()
  const spec = INVERSE_MAP[key]
  if (!spec) return 'relative'
  if (recipientGender === 'male') return spec.male
  if (recipientGender === 'female') return spec.female
  return spec.neutral
}

// ─── Suggestion types ──────────────────────────────────────────────────────

export type RelationshipSuggestionKind = 'sibling' | 'spouse' | 'in-law' | 'extended'

export interface RelationshipSuggestion {
  id: string
  kind: RelationshipSuggestionKind
  fromId: string
  toId: string
  fromName: string
  toName: string
  /** What fromId is to toId (display label) */
  label: string
  /** Why the system is suggesting this */
  reason: string
  /** 'high' = both parents shared; 'medium' = one parent or co-parent */
  confidence: 'high' | 'medium'
  /** Pending DB updates if the user accepts */
  actions: RelationshipAction[]
}

export interface RelationshipAction {
  memberId: string
  field: 'spouseIds' | 'parentIds'
  operation: 'add'
  value: string
}

// ─── Inference: co-parent spouse suggestions ──────────────────────────────

/**
 * Returns pairs who are co-parents of the same child but not yet
 * marked as spouses. Confidence is always 'medium' — this needs
 * user confirmation.
 */
export function inferCoParentSpouseSuggestions(
  members: FamilyMember[],
  focusId?: string,
): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()

  for (const child of members) {
    if (child.parentIds.length < 2) continue

    const parents = child.parentIds
      .map(pid => members.find(m => m.id === pid))
      .filter((m): m is FamilyMember => !!m)

    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        const a = parents[i]
        const b = parents[j]
        if (a.spouseIds.includes(b.id) || b.spouseIds.includes(a.id)) continue

        const key = [a.id, b.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        // Only surface if focusId is one of the pair (post-add context)
        if (focusId && a.id !== focusId && b.id !== focusId) continue

        const sharedChildren = members.filter(
          c => c.parentIds.includes(a.id) && c.parentIds.includes(b.id)
        )
        const childWord = sharedChildren.length === 1 ? child.name : `${sharedChildren.length} children`
        const aRel = a.gender === 'male' ? 'husband' : a.gender === 'female' ? 'wife' : 'spouse'
        const bRel = b.gender === 'male' ? 'husband' : b.gender === 'female' ? 'wife' : 'spouse'

        results.push({
          id: `coparent-${key}`,
          kind: 'spouse',
          fromId: a.id,
          toId: b.id,
          fromName: a.name,
          toName: b.name,
          label: `${a.name} & ${b.name} — Co-parents`,
          reason: `Both are parents of ${childWord} but not yet connected as spouses.`,
          confidence: 'medium',
          actions: [
            { memberId: a.id, field: 'spouseIds', operation: 'add', value: b.id },
            { memberId: b.id, field: 'spouseIds', operation: 'add', value: a.id },
          ],
        })

        // Suppress the unused variable warning
        void aRel; void bRel
      }
    }
  }

  return results
}

// ─── Inference: sibling suggestions ───────────────────────────────────────

/**
 * Returns pairs who share parents but don't yet have explicit
 * cross-references. Useful to surface after a new member is added
 * who shares parents with existing members.
 *
 * Note: the graph can already *display* these as siblings via
 * computeRelationLabel — this suggestion is about explicitly labelling
 * them so their `relationship` field reflects the correct label.
 */
export function inferSiblingLabelSuggestions(
  members: FamilyMember[],
  focusId?: string,
): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]
      const b = members[j]
      if (!a.parentIds.length || !b.parentIds.length) continue

      const sharedParents = a.parentIds.filter(pid => b.parentIds.includes(pid))
      if (sharedParents.length === 0) continue

      const key = [a.id, b.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)

      if (focusId && a.id !== focusId && b.id !== focusId) continue

      const aLabel = a.gender === 'male' ? 'brother' : a.gender === 'female' ? 'sister' : 'sibling'
      const bLabel = b.gender === 'male' ? 'brother' : b.gender === 'female' ? 'sister' : 'sibling'

      results.push({
        id: `sibling-${key}`,
        kind: 'sibling',
        fromId: a.id,
        toId: b.id,
        fromName: a.name,
        toName: b.name,
        label: `${a.name} & ${b.name} — Siblings`,
        reason: `${a.name} and ${b.name} share ${sharedParents.length === 2 ? 'both parents' : 'a parent'}.`,
        confidence: sharedParents.length === 2 ? 'high' : 'medium',
        // Sibling relationship is already traversable via parentIds;
        // accepting updates the display `relationship` label only — no structural change.
        actions: [],
      })
    }
  }

  return results
}

// ─── Inference: in-law chain (2-hop via spouse) ──────────────────────────────

/**
 * When a new member M is added as a spouse of X:
 *   - X's parents → M's father-in-law / mother-in-law
 *   - X's siblings → M's brother-in-law / sister-in-law
 */
export function inferInLawSuggestions(
  members: FamilyMember[],
  focusId?: string,
): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()
  const map = new Map(members.map(m => [m.id, m]))
  const focusMembers = focusId ? members.filter(m => m.id === focusId) : members

  for (const focus of focusMembers) {
    for (const spouseId of focus.spouseIds) {
      const spouse = map.get(spouseId)
      if (!spouse) continue

      // Spouse's parents → in-laws of focus
      for (const parentId of spouse.parentIds) {
        const parent = map.get(parentId)
        if (!parent) continue
        const key = [focus.id, parent.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const label =
          parent.gender === 'male' ? 'father-in-law' :
            parent.gender === 'female' ? 'mother-in-law' : 'parent-in-law'

        results.push({
          id: `inlaw-parent-${key}`,
          kind: 'in-law',
          fromId: focus.id,
          toId: parent.id,
          fromName: focus.name,
          toName: parent.name,
          label: `${parent.name} is your ${label}`,
          reason: `${parent.name} is ${spouse.name}'s parent — your new ${label}.`,
          confidence: 'high',
          actions: [],
        })
      }

      // Spouse's siblings (share a parent with spouse) → siblings-in-law
      if (spouse.parentIds.length > 0) {
        const spouseSiblings = members.filter(m =>
          m.id !== spouse.id &&
          m.id !== focus.id &&
          m.parentIds.some(pid => spouse.parentIds.includes(pid)),
        )
        for (const sibling of spouseSiblings) {
          const key = [focus.id, sibling.id].sort().join('|')
          if (seen.has(key)) continue
          seen.add(key)

          const label =
            sibling.gender === 'male' ? 'brother-in-law' :
              sibling.gender === 'female' ? 'sister-in-law' : 'sibling-in-law'

          results.push({
            id: `inlaw-sibling-${key}`,
            kind: 'in-law',
            fromId: focus.id,
            toId: sibling.id,
            fromName: focus.name,
            toName: sibling.name,
            label: `${sibling.name} is your ${label}`,
            reason: `${sibling.name} is ${spouse.name}'s sibling — your new ${label}.`,
            confidence: 'high',
            actions: [],
          })
        }
      }
    }
  }

  return results
}

// ─── Inference: extended family (2-hop via parent) ────────────────────────────

/**
 * When a new member M is added as a child of X:
 *   - X's parents → M's grandparents (paternal/maternal)
 *   - X's siblings → M's uncles/aunts (paternal/maternal)
 */
export function inferExtendedFamilySuggestions(
  members: FamilyMember[],
  focusId?: string,
): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()
  const map = new Map(members.map(m => [m.id, m]))
  const focusMembers = focusId ? members.filter(m => m.id === focusId) : members

  for (const focus of focusMembers) {
    for (const parentId of focus.parentIds) {
      const parent = map.get(parentId)
      if (!parent) continue
      const side =
        parent.gender === 'male' ? 'paternal' :
          parent.gender === 'female' ? 'maternal' : ''

      // Parent's parents → grandparents
      for (const gpId of parent.parentIds) {
        const gp = map.get(gpId)
        if (!gp) continue
        const key = [focus.id, gp.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const gpLabel =
          gp.gender === 'male' ? 'grandfather' :
            gp.gender === 'female' ? 'grandmother' : 'grandparent'
        const full = side ? `${side} ${gpLabel}` : gpLabel

        results.push({
          id: `grandrelation-${key}`,
          kind: 'extended',
          fromId: focus.id,
          toId: gp.id,
          fromName: focus.name,
          toName: gp.name,
          label: `${gp.name} is your ${full}`,
          reason: `${gp.name} is ${parent.name}'s parent — your ${full}.`,
          confidence: 'high',
          actions: [],
        })
      }

      // Parent's siblings → uncles/aunts
      if (parent.parentIds.length > 0) {
        const parentSiblings = members.filter(m =>
          m.id !== parent.id &&
          m.id !== focus.id &&
          m.parentIds.some(pid => parent.parentIds.includes(pid)),
        )
        for (const pSibling of parentSiblings) {
          const key = [focus.id, pSibling.id].sort().join('|')
          if (seen.has(key)) continue
          seen.add(key)

          const auLabel =
            pSibling.gender === 'male' ? 'uncle' :
              pSibling.gender === 'female' ? 'aunt' : 'uncle/aunt'
          const full = side ? `${side} ${auLabel}` : auLabel

          results.push({
            id: `auntuncle-${key}`,
            kind: 'extended',
            fromId: focus.id,
            toId: pSibling.id,
            fromName: focus.name,
            toName: pSibling.name,
            label: `${pSibling.name} is your ${full}`,
            reason: `${pSibling.name} is ${parent.name}'s sibling — your ${full}.`,
            confidence: 'high',
            actions: [],
          })
        }
      }
    }
  }

  return results
}

// ─── Inference: niece / nephew (2-hop via sibling) ────────────────────────────

/**
 * When a new member M shares parents with X (making X a sibling),
 * and X has children: those children are M's nieces/nephews.
 */
export function inferNieceNephewSuggestions(
  members: FamilyMember[],
  focusId?: string,
): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()
  const focusMembers = focusId ? members.filter(m => m.id === focusId) : members

  for (const focus of focusMembers) {
    if (!focus.parentIds.length) continue

    const focusSiblings = members.filter(
      m => m.id !== focus.id && m.parentIds.some(pid => focus.parentIds.includes(pid)),
    )

    for (const sibling of focusSiblings) {
      const siblingChildren = members.filter(m => m.parentIds.includes(sibling.id))
      for (const child of siblingChildren) {
        if (child.id === focus.id) continue
        const key = [focus.id, child.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const label =
          child.gender === 'male' ? 'nephew' :
            child.gender === 'female' ? 'niece' : 'nephew/niece'

        results.push({
          id: `niecenephew-${key}`,
          kind: 'extended',
          fromId: focus.id,
          toId: child.id,
          fromName: focus.name,
          toName: child.name,
          label: `${child.name} is your ${label}`,
          reason: `${child.name} is ${sibling.name}'s child — your ${label}.`,
          confidence: 'high',
          actions: [],
        })
      }
    }
  }

  return results
}

// ─── Main post-add entry point ─────────────────────────────────────────────

/**
 * Call this immediately after a new member is added.
 * Pass in the full updated member list (including the new member).
 * Returns suggestions to show the user, ordered by confidence then kind priority.
 *
 * Runs all inference passes and deduplicates globally so no pair appears twice.
 */
export function computePostAddSuggestions(
  newMemberId: string,
  allMembers: FamilyMember[],
): RelationshipSuggestion[] {
  const memberMap = new Map(allMembers.map(m => [m.id, m]))

  const raw: RelationshipSuggestion[] = [
    // Actionable first (structural changes)
    ...inferCoParentSpouseSuggestions(allMembers, newMemberId),
    // Informational (no DB write needed — BFS already handles display)
    ...inferSiblingLabelSuggestions(allMembers, newMemberId),
    ...inferInLawSuggestions(allMembers, newMemberId),
    ...inferExtendedFamilySuggestions(allMembers, newMemberId),
    ...inferNieceNephewSuggestions(allMembers, newMemberId),
  ]

  // Global deduplication: if two passes found the same pair, keep the first
  const seenPairs = new Set<string>()
  const deduped = raw.filter(s => {
    const key = [s.fromId, s.toId].sort().join('|')
    if (seenPairs.has(key)) return false
    seenPairs.add(key)
    return true
  })

  // Filter out actionable suggestions that target a deceased member.
  // Informational (actions.length === 0) suggestions about deceased ancestors
  // are still useful to show (e.g. "X is your grandfather"), but we should
  // never prompt the user to add a spouse link to a deceased person.
  const withoutDeceasedActions = deduped.filter(s => {
    if (s.actions.length === 0) return true // informational — always keep
    const toMember = memberMap.get(s.toId)
    const fromMember = memberMap.get(s.fromId)
    const toDeceased = !!(toMember?.isDeceased || toMember?.deathYear)
    const fromDeceased = !!(fromMember?.isDeceased || fromMember?.deathYear)
    return !toDeceased && !fromDeceased
  })

  // Sort: actionable (has actions) > high confidence > medium; alphabetical within tier
  return withoutDeceasedActions.sort((a, b) => {
    const aScore = (a.actions.length > 0 ? 2 : 0) + (a.confidence === 'high' ? 1 : 0)
    const bScore = (b.actions.length > 0 ? 2 : 0) + (b.confidence === 'high' ? 1 : 0)
    if (aScore !== bScore) return bScore - aScore
    return a.fromName.localeCompare(b.fromName)
  })
}

// ─── Graph consistency check ───────────────────────────────────────────────

export interface ConsistencyWarning {
  memberId: string
  memberName: string
  message: string
}

/**
 * Detects contradictory states in the graph.
 * Returns warnings that can be surfaced in a settings/admin view.
 */
export function validateGraphConsistency(members: FamilyMember[]): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = []
  const map = new Map(members.map(m => [m.id, m]))

  for (const m of members) {
    // Structural contradictions
    if (m.parentIds.includes(m.id)) {
      warnings.push({ memberId: m.id, memberName: m.name, message: 'Listed as their own parent.' })
    }
    if (m.spouseIds.includes(m.id)) {
      warnings.push({ memberId: m.id, memberName: m.name, message: 'Listed as their own spouse.' })
    }
    for (const pid of m.parentIds) {
      const parent = map.get(pid)
      if (parent?.parentIds.includes(m.id)) {
        warnings.push({
          memberId: m.id, memberName: m.name,
          message: `Circular parent-child relationship with ${parent.name}.`,
        })
      }
    }
    for (const sid of m.spouseIds) {
      const spouse = map.get(sid)
      if (spouse && !spouse.spouseIds.includes(m.id)) {
        warnings.push({
          memberId: m.id, memberName: m.name,
          message: `One-directional spouse link with ${spouse.name} — may need repair.`,
        })
      }
    }

    // Temporal validation: check parent-child birth year gap
    if (m.birthYear) {
      for (const pid of m.parentIds) {
        const parent = map.get(pid)
        if (!parent?.birthYear) continue
        const gap = m.birthYear - parent.birthYear
        if (gap < 12) {
          warnings.push({
            memberId: m.id, memberName: m.name,
            message: `Age gap with parent ${parent.name} is only ${gap} year${gap === 1 ? '' : 's'} — likely incorrect.`,
          })
        } else if (gap > 70) {
          warnings.push({
            memberId: m.id, memberName: m.name,
            message: `Age gap with parent ${parent.name} is ${gap} years — unusually large, please verify.`,
          })
        }
      }

      // Spouse should be within a reasonable age range (±40 years is generous)
      for (const sid of m.spouseIds) {
        const spouse = map.get(sid)
        if (!spouse?.birthYear) continue
        const ageDiff = Math.abs(m.birthYear - spouse.birthYear)
        if (ageDiff > 40) {
          warnings.push({
            memberId: m.id, memberName: m.name,
            message: `Age difference with spouse ${spouse.name} is ${ageDiff} years — please verify.`,
          })
        }
      }
    }
  }

  return warnings
}
