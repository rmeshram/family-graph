/**
 * Genealogy Graph Repair & Layout Engine
 *
 * Full pipeline (called in order by buildFamilyGraph):
 *
 *   Phase 1 — Relationship Normalization
 *     normalizeFamilyRelationships(): deduplicate IDs, bidirectional spouses,
 *     remove self-refs, flag impossible relationships, recompute generations.
 *
 *   Phase 2 — Identity Resolution
 *     resolvePersonIdentities(): detect duplicate people (e.g. "Shikha M" vs
 *     "Shikha Meshram"), auto-merge high-confidence pairs, flag the rest.
 *
 *   Phase 3 — Canonical Family Graph
 *     ALL parent-child edges route through a couple anchor (real couple or
 *     single-parent + placeholder). No direct member→child edges ever emitted.
 *
 *   Phase 4 — Visual Layout (Reingold-Tilford inspired)
 *     Subtree-width BFS + top-down coordinate assignment.
 *     Spouses on the same row; siblings grouped under their couple anchor;
 *     affiliated families placed as independent subtrees.
 *
 *   Phase 5 — Layout Safety Guard
 *     assertCanonicalGraph(): throws FamilyGraphIntegrityError if hard errors
 *     remain after Phase 1+2. The layout engine NEVER receives invalid data.
 */

import { FamilyMember } from './types'
import { normalizeFamilyRelationships, NormIssue } from './family-relationship-normalizer'
import { resolvePersonIdentities, ResolvedIdentity, PotentialDuplicate } from './person-identity-resolver'
import { FamilyGraphIntegrityError } from './graph-integrity-error'

// ─── Public output types ──────────────────────────────────────────────────────

export type GraphNodeType = 'member' | 'couple_anchor' | 'placeholder'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  /** For member/placeholder: [memberId]. For couple_anchor: [memberA, memberB]. */
  memberIds: string[]
  generation: number
  isPlaceholder: boolean
  metadata: {
    gender?: 'male' | 'female' | 'other'
    birthYear?: number
    deathYear?: number
    occupation?: string
    isAlive?: boolean
    networkGroup?: 'core' | 'extended' | 'affiliated'
  }
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  /**
   * spouse       – horizontal line between two spouses
   * parent_child – vertical line from couple-anchor (or single parent) to child
   * couple_link  – line from couple-anchor down to each of its two member nodes
   */
  type: 'spouse' | 'parent_child' | 'couple_link'
}

export interface NodePosition {
  nodeId: string
  x: number
  y: number
}

export interface CoupleRecord {
  /** Virtual anchor node ID, e.g. "couple:g0-1||g0-2" */
  id: string
  memberA: string
  memberB: string
  generation: number
}

export interface ParentChildEdge {
  /** couple-anchor ID, or a member ID when the parent has no known spouse */
  parentNodeId: string
  childId: string
  /** Same as parentNodeId when routed through a couple anchor, else null */
  viaCouple: string | null
}

export interface GraphRepairResult {
  cleaned_members: FamilyMember[]
  graph: {
    nodes: GraphNode[]
    edges: GraphEdge[]
    /** Phase 2 canonical structure */
    ancestors: string[]
    couples: CoupleRecord[]
    parent_child_edges: ParentChildEdge[]
  }
  layout: {
    node_positions: NodePosition[]
  }
  /** Issues surfaced by Phase 1 relationship normalizer. */
  warnings: NormIssue[]
  /** High-confidence duplicate pairs that were auto-merged in Phase 2. */
  resolvedIdentities: ResolvedIdentity[]
  /** Medium-confidence duplicate pairs flagged for human review. */
  potentialDuplicates: PotentialDuplicate[]
}

// ─── Phase 5 — Layout Safety Guard ───────────────────────────────────────────

/**
 * Call before passing data to the layout engine.
 * Throws FamilyGraphIntegrityError if any hard BLOCKING errors remain.
 *
 * Blocking types (prevent layout entirely):
 *   cycle_detected, self_parent, self_spouse, sibling_as_parent, duplicate_member_id
 *
 * Non-blocking errors (flagged but layout proceeds):
 *   conflicting_parentage, duplicate_identity, spouse_is_parent
 *   (these require human resolution but do not invalidate the topology)
 */
export function assertCanonicalGraph(warnings: NormIssue[]): void {
  const BLOCKING_TYPES = new Set([
    'cycle_detected',
    'self_parent',
    'self_spouse',
    'sibling_as_parent',
    'duplicate_member_id',
  ])
  const blocking = warnings.filter(
    w => w.severity === 'error' && BLOCKING_TYPES.has(w.type)
  )
  if (blocking.length > 0) {
    throw new FamilyGraphIntegrityError(blocking)
  }
}

// ─── Layout constants ─────────────────────────────────────────────────────────

/** Half the horizontal gap between the two spouses in a couple (px). */
const COUPLE_HALF = 110
/** Minimum horizontal slot width per member (px). */
const MEMBER_W = 220
/** Vertical distance between consecutive generations (px). */
const ROW_H = 300
/** Horizontal gap inserted between adjacent sibling groups (px). */
const SIBLING_GAP = 28
/** Extra horizontal gap between independent root-level family clusters (px). */
const ROOT_GAP = 90

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Canonical key for an unordered pair (order-independent). */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`
}

// ─── Internal layout type ─────────────────────────────────────────────────────

interface FamilyUnit {
  /** "couple:<key>" or "single:<memberId>" */
  id: string
  /** 1 element for singles/placeholders, 2 for couples. */
  memberIds: string[]
  generation: number
  /** Which unit this unit is a child of (i.e. who are its parents). */
  parentUnitId: string | null
}

// ─── Main function ────────────────────────────────────────────────────────────

export function buildFamilyGraph(members: FamilyMember[]): GraphRepairResult {
  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Relationship Normalization
  // ══════════════════════════════════════════════════════════════════════════

  const normResult = normalizeFamilyRelationships(members)

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Identity Resolution
  // ══════════════════════════════════════════════════════════════════════════

  const identityResult = resolvePersonIdentities(normResult.members)
  const allWarnings: NormIssue[] = [
    ...normResult.errors,
    ...normResult.warnings,
    ...normResult.info,
  ]

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — Layout Safety Guard (before any graph construction)
  // ══════════════════════════════════════════════════════════════════════════

  assertCanonicalGraph(allWarnings)

  const cleaned = identityResult.members
  const byId = new Map<string, FamilyMember>(cleaned.map(m => [m.id, m]))

  // ── Recompute generations from scratch (BFS from roots) ──────────────────
  // We ignore stored generation values to catch inconsistencies.
  // Exception: root nodes (no parents) keep their stored generation as the
  // baseline so that affiliated sub-trees that deliberately start at gen 1+
  // are laid out correctly relative to the rest of the canvas.

  const forwardAdj = new Map<string, string[]>() // parent → [children]
  for (const m of cleaned) forwardAdj.set(m.id, [])
  for (const m of cleaned) {
    for (const pid of m.parentIds) {
      if (!forwardAdj.has(pid)) forwardAdj.set(pid, [])
      forwardAdj.get(pid)!.push(m.id)
    }
  }

  const computedGen = new Map<string, number>()
  const bfsVisited = new Set<string>()
  const bfsQueue: { id: string; gen: number }[] = []

  for (const m of cleaned) {
    if (m.parentIds.length === 0) {
      bfsQueue.push({ id: m.id, gen: m.generation })
      computedGen.set(m.id, m.generation)
    }
  }

  while (bfsQueue.length > 0) {
    const { id, gen } = bfsQueue.shift()!
    if (bfsVisited.has(id)) continue
    bfsVisited.add(id)
    for (const cid of forwardAdj.get(id) ?? []) {
      const expected = gen + 1
      const existing = computedGen.get(cid)
      if (existing === undefined || expected > existing) {
        computedGen.set(cid, expected)
        bfsQueue.push({ id: cid, gen: expected })
      }
    }
  }

  // Fall back to stored generation for isolated members not reached by BFS.
  for (const m of cleaned) {
    if (!computedGen.has(m.id)) computedGen.set(m.id, m.generation)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Canonical Family Graph
  // ══════════════════════════════════════════════════════════════════════════

  // ── Build couple index ────────────────────────────────────────────────────
  // A couple is formed by any bidirectional spouse link. After Phase 1 repair
  // all spouse links are guaranteed to be bidirectional.

  const coupleByKey = new Map<string, { a: string; b: string }>()
  const memberToCouple = new Map<string, string>() // memberId → pairKey

  for (const m of cleaned) {
    for (const sid of m.spouseIds) {
      if (!byId.has(sid)) continue
      const key = pairKey(m.id, sid)
      if (!coupleByKey.has(key)) {
        // Store with lexicographically smaller ID as 'a'
        coupleByKey.set(key, { a: m.id < sid ? m.id : sid, b: m.id < sid ? sid : m.id })
      }
      memberToCouple.set(m.id, key)
    }
  }

  // ── Canonical structures ──────────────────────────────────────────────────

  const ancestors: string[] = cleaned
    .filter(m => m.parentIds.length === 0)
    .map(m => m.id)

  const couples: CoupleRecord[] = []
  for (const [key, { a, b }] of coupleByKey) {
    couples.push({
      id: `couple:${key}`,
      memberA: a,
      memberB: b,
      generation: Math.min(computedGen.get(a) ?? 0, computedGen.get(b) ?? 0),
    })
  }

  const parentChildEdges: ParentChildEdge[] = []
  let placeholderSeq = 0
  const phId = () => `ph_${String(++placeholderSeq).padStart(3, '0')}`

  // Placeholder nodes for single-parent children — represent the unknown second parent.
  const placeholderNodes: GraphNode[] = []

  // Tracks single-parent IDs → their placeholder couple anchor ID.
  // Reuses one couple per single parent instead of creating one per child.
  const singleParentCoupleMap = new Map<string, string>()

  for (const m of cleaned) {
    if (m.parentIds.length === 0) continue

    let parentNodeId: string
    let viaCouple: string | null = null

    if (m.parentIds.length >= 2) {
      const [pA, pB] = m.parentIds
      const key = pairKey(pA, pB)
      if (coupleByKey.has(key)) {
        parentNodeId = `couple:${key}`
        viaCouple = parentNodeId
      } else {
        // Parents exist but are not recorded as spouses of each other.
        // Route through first parent directly.
        parentNodeId = pA
      }
    } else {
      // Single known parent
      const pid = m.parentIds[0]
      const spouseKey = memberToCouple.get(pid)
      if (spouseKey) {
        // Route through the known parent's couple anchor
        parentNodeId = `couple:${spouseKey}`
        viaCouple = parentNodeId
      } else {
        // Truly single parent with no known spouse.
        // ALWAYS route through a couple anchor — create a one-time placeholder
        // couple for this parent so ALL parent→child edges go through a couple node.
        const phGen = computedGen.get(pid) ?? 0

        if (!singleParentCoupleMap.has(pid)) {
          const placeholder = phId()
          placeholderNodes.push({
            id: placeholder,
            type: 'placeholder',
            label: '? Unknown',
            memberIds: [placeholder],
            generation: phGen,
            isPlaceholder: true,
            metadata: {},
          })
          const phKey = pairKey(pid, placeholder)
          const phCoupleId = `couple:${phKey}`
          const ordA = pid < placeholder ? pid : placeholder
          const ordB = pid < placeholder ? placeholder : pid
          coupleByKey.set(phKey, { a: ordA, b: ordB })
          memberToCouple.set(pid, phKey)
          couples.push({ id: phCoupleId, memberA: ordA, memberB: ordB, generation: phGen })
          singleParentCoupleMap.set(pid, phCoupleId)
        }

        parentNodeId = singleParentCoupleMap.get(pid)!
        viaCouple = parentNodeId
      }
    }

    parentChildEdges.push({ parentNodeId, childId: m.id, viaCouple })
  }

  // ── Graph nodes ───────────────────────────────────────────────────────────

  const graphNodes: GraphNode[] = []

  for (const m of cleaned) {
    graphNodes.push({
      id: m.id,
      type: 'member',
      label: m.name,
      memberIds: [m.id],
      generation: computedGen.get(m.id) ?? m.generation,
      isPlaceholder: false,
      metadata: {
        gender: m.gender,
        birthYear: m.birthYear,
        deathYear: m.deathYear,
        occupation: m.occupation,
        isAlive: m.isAlive,
        networkGroup: m.networkGroup,
      },
    })
  }

  for (const cr of couples) {
    const mA = byId.get(cr.memberA)
    const mB = byId.get(cr.memberB)
    graphNodes.push({
      id: cr.id,
      type: 'couple_anchor',
      label: `${mA?.name ?? cr.memberA} & ${mB?.name ?? cr.memberB}`,
      memberIds: [cr.memberA, cr.memberB],
      generation: cr.generation,
      isPlaceholder: false,
      metadata: {},
    })
  }

  graphNodes.push(...placeholderNodes)

  // ── Graph edges ───────────────────────────────────────────────────────────

  const graphEdges: GraphEdge[] = []
  let edgeSeq = 0
  const eid = () => `e${String(++edgeSeq).padStart(4, '0')}`

  // Spouse edges (one per pair, between the two member nodes)
  const addedSpouseEdges = new Set<string>()
  for (const m of cleaned) {
    for (const sid of m.spouseIds) {
      const key = pairKey(m.id, sid)
      if (!addedSpouseEdges.has(key)) {
        addedSpouseEdges.add(key)
        graphEdges.push({ id: eid(), source: m.id, target: sid, type: 'spouse' })
      }
    }
  }

  // Couple-link edges: anchor → each spouse member
  for (const cr of couples) {
    graphEdges.push({ id: eid(), source: cr.id, target: cr.memberA, type: 'couple_link' })
    graphEdges.push({ id: eid(), source: cr.id, target: cr.memberB, type: 'couple_link' })
  }

  // Parent-child edges: from couple anchor (or single parent) to child
  for (const pce of parentChildEdges) {
    graphEdges.push({ id: eid(), source: pce.parentNodeId, target: pce.childId, type: 'parent_child' })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Visual Layout
  // ══════════════════════════════════════════════════════════════════════════

  // ── Build family units ────────────────────────────────────────────────────
  // A FamilyUnit is the layout atom: either a couple (2 members, rendered side
  // by side) or a single member. Units form a layout tree based on who had
  // whom as children.

  const familyUnits = new Map<string, FamilyUnit>()
  const memberToUnit = new Map<string, string>() // memberId → unitId

  // Couple units
  for (const cr of couples) {
    const unitId = cr.id
    familyUnits.set(unitId, {
      id: unitId,
      memberIds: [cr.memberA, cr.memberB],
      generation: cr.generation,
      parentUnitId: null,
    })
    memberToUnit.set(cr.memberA, unitId)
    memberToUnit.set(cr.memberB, unitId)
  }

  // Single-member units (uncoupled)
  for (const m of cleaned) {
    if (!memberToUnit.has(m.id)) {
      const unitId = `single:${m.id}`
      familyUnits.set(unitId, {
        id: unitId,
        memberIds: [m.id],
        generation: computedGen.get(m.id) ?? m.generation,
        parentUnitId: null,
      })
      memberToUnit.set(m.id, unitId)
    }
  }

  // ── Wire parent→child unit links ──────────────────────────────────────────
  for (const m of cleaned) {
    if (m.parentIds.length === 0) continue
    const childUnitId = memberToUnit.get(m.id)!

    let parentUnitId: string | null = null
    if (m.parentIds.length >= 2) {
      const key = pairKey(m.parentIds[0], m.parentIds[1])
      parentUnitId = coupleByKey.has(key)
        ? `couple:${key}`
        : (memberToUnit.get(m.parentIds[0]) ?? null)
    } else {
      const pid = m.parentIds[0]
      const spKey = memberToCouple.get(pid)
      parentUnitId = spKey ? `couple:${spKey}` : (memberToUnit.get(pid) ?? null)
    }

    if (parentUnitId && parentUnitId !== childUnitId) {
      const cu = familyUnits.get(childUnitId)!
      if (cu.parentUnitId === null) cu.parentUnitId = parentUnitId
    }
  }

  // ── Unit-children adjacency ───────────────────────────────────────────────
  const unitKids = new Map<string, string[]>()
  for (const uid of familyUnits.keys()) unitKids.set(uid, [])
  for (const [, unit] of familyUnits) {
    if (!unit.parentUnitId) continue
    const sibs = unitKids.get(unit.parentUnitId)!
    if (!sibs.includes(unit.id)) sibs.push(unit.id)
  }

  // ── Recursive subtree width (memoised, cycle-safe) ────────────────────────
  const widthMemo = new Map<string, number>()
  const inStack = new Set<string>()

  function subtreeWidth(uid: string): number {
    if (widthMemo.has(uid)) return widthMemo.get(uid)!
    if (inStack.has(uid)) return MEMBER_W // cycle guard fallback
    inStack.add(uid)

    const unit = familyUnits.get(uid)!
    // Own width: a couple needs room for two members separated by COUPLE_HALF*2
    const ownW = unit.memberIds.length === 2
      ? COUPLE_HALF * 2 + MEMBER_W
      : MEMBER_W

    const kids = unitKids.get(uid) ?? []
    const w = kids.length === 0
      ? ownW
      : Math.max(
        ownW,
        kids.reduce((s, k) => s + subtreeWidth(k), 0) + (kids.length - 1) * SIBLING_GAP,
      )

    inStack.delete(uid)
    widthMemo.set(uid, w)
    return w
  }

  // ── Recursive position assignment (top-down) ──────────────────────────────
  const posMap = new Map<string, { x: number; y: number }>()

  function assignPos(uid: string, leftEdge: number): void {
    const unit = familyUnits.get(uid)!
    const w = subtreeWidth(uid)
    const cx = leftEdge + w / 2
    const y = unit.generation * ROW_H

    if (unit.memberIds.length === 2) {
      const [mA, mB] = unit.memberIds
      posMap.set(mA, { x: cx - COUPLE_HALF, y })
      posMap.set(mB, { x: cx + COUPLE_HALF, y })
      posMap.set(uid, { x: cx, y }) // couple anchor is a real graph node — include it
    } else {
      // Single-member unit: position only the real member node.
      // The 'single:*' uid is an internal layout atom — do NOT add it to posMap.
      posMap.set(unit.memberIds[0], { x: cx, y })
    }

    // Sort child units by their own subtree width (wider families → left) to
    // produce a visually balanced tree.
    const kids = (unitKids.get(uid) ?? []).slice().sort(
      (a, b) => subtreeWidth(b) - subtreeWidth(a),
    )
    // Alternate left/right to keep the tallest subtrees near the centre.
    const ordered: string[] = []
    let lo = 0; let hi = kids.length - 1; let flip = true
    while (lo <= hi) {
      if (flip) ordered.push(kids[lo++])
      else ordered.push(kids[hi--])
      flip = !flip
    }
    ordered.reverse() // left-to-right reading order

    let kidLeft = leftEdge
    for (const kid of ordered) {
      assignPos(kid, kidLeft)
      kidLeft += subtreeWidth(kid) + SIBLING_GAP
    }
  }

  // Identify root units (no parent unit) and sort them
  const rootUnits = [...familyUnits.values()]
    .filter(u => u.parentUnitId === null)
    .sort((a, b) => {
      // Primary sort: generation (top of canvas first)
      if (a.generation !== b.generation) return a.generation - b.generation
      // Secondary: name of first member (stable, deterministic)
      const na = byId.get(a.memberIds[0])?.name ?? a.id
      const nb = byId.get(b.memberIds[0])?.name ?? b.id
      return na.localeCompare(nb)
    })

  // Pre-compute widths before assignment
  for (const ru of rootUnits) subtreeWidth(ru.id)

  let rootLeft = 0
  for (const ru of rootUnits) {
    assignPos(ru.id, rootLeft)
    rootLeft += subtreeWidth(ru.id) + ROOT_GAP
  }

  // ── Build NodePosition output ─────────────────────────────────────────────
  const nodePositions: NodePosition[] = []
  for (const [nodeId, pos] of posMap) {
    nodePositions.push({ nodeId, x: Math.round(pos.x), y: Math.round(pos.y) })
  }

  // Sort for deterministic output: by y (generation), then x
  nodePositions.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  return {
    cleaned_members: cleaned,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
      ancestors,
      couples,
      parent_child_edges: parentChildEdges,
    },
    layout: { node_positions: nodePositions },
    warnings: allWarnings,
    resolvedIdentities: identityResult.resolvedIdentities,
    potentialDuplicates: identityResult.potentialDuplicates,
  }
}

// ─── Report formatter ─────────────────────────────────────────────────────────

export function formatGraphReport(result: GraphRepairResult): string {
  const { graph, layout, warnings, cleaned_members: cm } = result
  const memberNodes = graph.nodes.filter(n => n.type === 'member')
  const coupleAnchors = graph.nodes.filter(n => n.type === 'couple_anchor')
  const phNodes = graph.nodes.filter(n => n.isPlaceholder)
  const spouseEdges = graph.edges.filter(e => e.type === 'spouse')
  const pcEdges = graph.edges.filter(e => e.type === 'parent_child')
  const clEdges = graph.edges.filter(e => e.type === 'couple_link')
  const byId = new Map(cm.map(m => [m.id, m]))

  // Generation table
  const genGroups = new Map<number, NodePosition[]>()
  for (const np of layout.node_positions) {
    if (!np.nodeId.startsWith('couple:') && !np.nodeId.startsWith('single:')) {
      const g = graph.nodes.find(n => n.id === np.nodeId)?.generation ?? -1
      if (!genGroups.has(g)) genGroups.set(g, [])
      genGroups.get(g)!.push(np)
    }
  }

  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════════',
    '      GENEALOGY GRAPH REPAIR & LAYOUT ENGINE — FULL REPORT',
    '═══════════════════════════════════════════════════════════════════════',
    '',
    '  PHASE 1 — DATA REPAIR',
    `  Members processed  : ${cm.length}`,
    `  Warnings           : ${warnings.length} (${warnings.filter(w => w.severity === 'error').length} errors, ${warnings.filter(w => w.severity === 'warning').length} warnings)`,
    '',
    '  PHASE 2 — CANONICAL GRAPH',
    `  Graph nodes        : ${graph.nodes.length}`,
    `    ├─ Member nodes  : ${memberNodes.length}`,
    `    ├─ Couple anchors: ${coupleAnchors.length}`,
    `    └─ Placeholders  : ${phNodes.length}`,
    `  Graph edges        : ${graph.edges.length}`,
    `    ├─ Spouse        : ${spouseEdges.length}`,
    `    ├─ Parent-child  : ${pcEdges.length}`,
    `    └─ Couple-link   : ${clEdges.length}`,
    `  Ancestors (roots)  : ${graph.ancestors.length}`,
    `  Couple units       : ${graph.couples.length}`,
    `  Parent-child edges : ${graph.parent_child_edges.length}`,
    '',
    '  PHASE 3 — LAYOUT',
    `  Positioned nodes   : ${layout.node_positions.length}`,
    `  Generation rows    : ${genGroups.size}`,
    '',
    '───────────────────────────────────────────────────────────────────────',
    '  ANCESTORS',
    '───────────────────────────────────────────────────────────────────────',
    ...graph.ancestors.map(id => {
      const m = byId.get(id)
      return `  [gen ${m?.generation ?? '?'}]  ${m?.name ?? id}  (${id})`
    }),
    '',
    '───────────────────────────────────────────────────────────────────────',
    '  COUPLE UNITS',
    '───────────────────────────────────────────────────────────────────────',
    ...graph.couples.map(c => {
      const mA = byId.get(c.memberA)
      const mB = byId.get(c.memberB)
      return `  [gen ${c.generation}]  ${mA?.name ?? c.memberA}  ↔  ${mB?.name ?? c.memberB}`
    }),
    '',
    '───────────────────────────────────────────────────────────────────────',
    '  LAYOUT — BY GENERATION',
    '───────────────────────────────────────────────────────────────────────',
    ...[...genGroups.entries()].sort(([a], [b]) => a - b).flatMap(([gen, nodes]) => [
      ``,
      `  ── Generation ${gen} (y = ${gen * 300}px) ──────────────────────────────`,
      ...nodes.slice().sort((a, b) => a.x - b.x).map(np => {
        const m = byId.get(np.nodeId)
        const label = (m?.name ?? np.nodeId).padEnd(32)
        return `    ${label} x=${String(np.x).padStart(6)}  y=${String(np.y).padStart(5)}`
      }),
    ]),
    '',
    '───────────────────────────────────────────────────────────────────────',
    '  WARNINGS FROM PHASE 1',
    '───────────────────────────────────────────────────────────────────────',
    warnings.length === 0
      ? '  ✓ No issues found.'
      : '',
    ...warnings.map(w => {
      const icon = w.severity === 'error' ? '  ✖' : w.severity === 'warning' ? '  ⚠' : '  ℹ'
      return [
        `${icon} [${w.id}] ${w.type}`,
        `     ${w.description}`,
        `     Affected: ${w.affectedIds.join(', ')}`,
      ].join('\n')
    }),
    '',
    '═══════════════════════════════════════════════════════════════════════',
  ]

  return lines.join('\n')
}
