import type { FamilyMember } from './types'
import { RELATIONSHIP_MAP } from './relationship-map'

// ══════════════════════════════════════════════════════════════════════════════
// ── SECTION 1: CANONICAL GRAPH ENGINE ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export type EdgeType = 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING'

interface GraphEdge {
  to: string
  type: EdgeType
}

export type RelationshipGraph = Map<string, GraphEdge[]>

export interface GraphPath {
  peoplePath: string[]
  edgePath: EdgeType[]
}

export interface RelationMetadata {
  side: 'paternal' | 'maternal' | 'spouse' | 'mixed' | null
  type: 'blood' | 'marriage' | 'mixed'
  generationDelta: number
  cousinDegree: number | null
  removedLevel: number | null
  hopCount: number
}

export interface RelationshipResultFound {
  found: true
  relationship: string
  path: EdgeType[]
  normalized: string
  people: string[]
  semanticChain: string[]
  chainSentence: string
  metadata: RelationMetadata
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

export function buildRelationshipGraph(members: FamilyMember[]): RelationshipGraph {
  const graph: RelationshipGraph = new Map()
  const memberIds = new Set(members.map(m => m.id))

  for (const m of members) graph.set(m.id, [])

  const addEdge = (from: string, to: string, type: EdgeType) => {
    if (!graph.has(from)) graph.set(from, [])
    const edges = graph.get(from)!
    // Prevent duplicate sibling or parent/child structural double-edges
    if (!edges.some(e => e.to === to && e.type === type)) {
      edges.push({ to, type })
    }
  }

  // PARENT / CHILD
  for (const m of members) {
    for (const pid of (m.parentIds ?? [])) {
      if (!memberIds.has(pid)) continue
      addEdge(m.id, pid, 'PARENT')
      addEdge(pid, m.id, 'CHILD')
    }
  }

  // SPOUSE
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

  // SIBLING — Derived cleanly without producing duplicate entries across multi-parent pairs
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

export function findPath(graph: RelationshipGraph, fromId: string, toId: string): GraphPath | null {
  if (fromId === toId) return { peoplePath: [fromId], edgePath: [] }
  if (!graph.has(fromId) || !graph.has(toId)) return null

  const parent = new Map<string, { from: string; via: EdgeType } | null>([[fromId, null]])
  const queue: string[] = [fromId]
  let found = false

  while (queue.length > 0) {
    const cur = queue.shift()!

    if (cur === toId) {
      found = true
      break
    }

    for (const { to, type } of (graph.get(cur) ?? [])) {
      if (parent.has(to)) continue

      parent.set(to, { from: cur, via: type })

      if (to === toId) {
        found = true
      }
      if (!found) {
        queue.push(to)
      }
    }
  }

  if (!parent.has(toId)) return null

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

export function normalizeEdgePath(edgePath: EdgeType[]): string {
  return edgePath.join('>')
}

// ── LCA-based structural classifier ──────────────────────────────────────────

interface LCAResult {
  lcaId: string
  depthA: number
  depthB: number
  ancestorsA: Map<string, number>
  ancestorsB: Map<string, number>
}

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

function findLCA(graph: RelationshipGraph, fromId: string, toId: string): LCAResult | null {
  const ancestorsA = buildAncestorSet(graph, fromId)
  const ancestorsB = buildAncestorSet(graph, toId)

  let best: { lcaId: string; depthA: number; depthB: number } | null = null
  for (const [id, dA] of ancestorsA) {
    const dB = ancestorsB.get(id)
    if (dB === undefined) continue
    if (!best || (dA + dB) < (best.depthA + best.depthB)) {
      best = { lcaId: id, depthA: dA, depthB: dB }
    }
  }
  return best ? { ...best, ancestorsA, ancestorsB } : null
}

function classifyFromLCA(
  lca: LCAResult,
  male: boolean,
  female: boolean,
  memberMap?: Map<string, FamilyMember>,
  peoplePath?: string[],
): string {
  const { depthA, depthB, ancestorsA, ancestorsB } = lca

  // FIXED: Concrete pathway derivation from verified BFS path nodes
  const pathwayParent = (): FamilyMember | null => {
    if (!memberMap) return null
    if (peoplePath && peoplePath.length >= 2) {
      const p = memberMap.get(peoplePath[1])
      if (p && !p.id.startsWith('__virt_')) return p
    }
    for (const [pid, depth] of ancestorsA) {
      if (depth !== 1) continue
      const p = memberMap.get(pid)
      if (!p || p.id.startsWith('__virt_')) continue
      if (ancestorsB.has(pid)) return p
    }
    return null
  }

  // Ancestor
  if (depthA > 0 && depthB === 0) {
    if (depthA === 1) return male ? 'Father' : female ? 'Mother' : 'Parent'
    if (depthA === 2) {
      const pp = pathwayParent()
      const pM = pp ? isMale(pp) : false, pF = pp ? isFemale(pp) : false
      if (male) return pM ? 'Paternal Grandfather' : pF ? 'Maternal Grandfather' : 'Grandfather'
      if (female) return pM ? 'Paternal Grandmother' : pF ? 'Maternal Grandmother' : 'Grandmother'
      return 'Grandparent'
    }
    const greats = 'Great-'.repeat(depthA - 2)
    return male ? `${greats}grandfather` : female ? `${greats}grandmother` : `${greats}grandparent`
  }

  // Descendant
  if (depthA === 0 && depthB > 0) {
    if (depthB === 1) return male ? 'Son' : female ? 'Daughter' : 'Child'
    if (depthB === 2) return male ? 'Grandson' : female ? 'Granddaughter' : 'Grandchild'
    const greats = 'Great-'.repeat(depthB - 2)
    return male ? `${greats}grandson` : female ? `${greats}granddaughter` : `${greats}grandchild`
  }

  // Sibling
  if (depthA === 1 && depthB === 1) {
    return male ? 'Brother' : female ? 'Sister' : 'Sibling'
  }

  // Uncle / Aunt
  if (depthA === 2 && depthB === 1) {
    const pp = pathwayParent()
    const pM = pp ? isMale(pp) : false, pF = pp ? isFemale(pp) : false
    if (male) return pM ? 'Paternal Uncle (Chacha/Tau)' : pF ? 'Maternal Uncle (Mama)' : 'Uncle'
    if (female) return pM ? 'Paternal Aunt (Bua)' : pF ? 'Maternal Aunt (Mausi/Mami)' : 'Aunt'
    return 'Uncle/Aunt'
  }

  // Nephew / Niece
  if (depthA === 1 && depthB === 2) {
    return male ? 'Nephew' : female ? 'Niece' : 'Nephew/Niece'
  }

  // Great-uncle / Great-aunt
  if (depthA === 3 && depthB === 1) {
    return male ? 'Great-uncle' : female ? 'Great-aunt' : 'Great-uncle/aunt'
  }
  if (depthA === 1 && depthB === 3) {
    return male ? 'Grand-nephew' : female ? 'Grand-niece' : 'Grand-nephew/niece'
  }
  if (depthB === 1 && depthA > 3) {
    const greats = 'Great-'.repeat(depthA - 2)
    return male ? `${greats}uncle` : female ? `${greats}aunt` : `${greats}uncle/aunt`
  }
  if (depthA === 1 && depthB > 3) {
    const greats = 'Great-'.repeat(depthB - 2)
    return male ? `${greats}nephew` : female ? `${greats}niece` : `${greats}nephew/niece`
  }

  // Cousin Formula
  const degree = Math.min(depthA, depthB) - 1
  const removed = Math.abs(depthA - depthB)
  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh']
  const ordinal = ordinals[degree - 1] ?? `${degree}th`

  if (degree === 1) {
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
  return m ? 'Husband' : f ? 'Wife' : 'Spouse'
}

function edgeArrowLabel(type: EdgeType): string {
  if (type === 'PARENT') return '↑'
  if (type === 'CHILD') return '↓'
  return '↔'
}

function resolveLabel(
  normalized: string,
  peoplePath: string[],
  memberMap: Map<string, FamilyMember>,
  lca?: LCAResult | null,
): string {
  const target = memberMap.get(peoplePath[peoplePath.length - 1])
  const male = isMale(target)
  const female = isFemale(target)

  if (normalized === 'PARENT>SIBLING' || normalized === 'PARENT>PARENT>CHILD') {
    const intermediateParent = memberMap.get(peoplePath[1])
    if (intermediateParent) {
      const pM = isMale(intermediateParent), pF = isFemale(intermediateParent)
      if (male) return pM ? 'Paternal Uncle (Chacha/Tau)' : pF ? 'Maternal Uncle (Mama)' : 'Uncle'
      if (female) return pM ? 'Paternal Aunt (Bua)' : pF ? 'Maternal Aunt (Mausi/Mami)' : 'Aunt'
    }
    return male ? 'Uncle' : female ? 'Aunt' : 'Uncle/Aunt'
  }

  const hasSpouse = normalized.includes('SPOUSE')
  if (!hasSpouse && lca) {
    return classifyFromLCA(lca, male, female, memberMap, peoplePath)
  }

  const entry = RELATIONSHIP_MAP[normalized]
  if (entry) {
    if (male && entry.male) return entry.male
    if (female && entry.female) return entry.female
    return entry.neutral
  }

  return deriveDynamicLabel(normalized, male, female)
}

function deriveDynamicLabel(normalized: string, male: boolean, female: boolean): string {
  const edges = normalized.split('>')

  if (edges.every(e => e === 'PARENT')) {
    const n = edges.length
    if (n === 2) return male ? 'Grandfather' : female ? 'Grandmother' : 'Grandparent'
    if (n === 3) return male ? 'Great-grandfather' : female ? 'Great-grandmother' : 'Great-grandparent'
    const greats = 'Great-'.repeat(n - 2)
    return male ? `${greats}grandfather` : female ? `${greats}grandmother` : `${greats}grandparent`
  }

  if (edges.every(e => e === 'CHILD')) {
    const n = edges.length
    if (n === 2) return male ? 'Grandson' : female ? 'Granddaughter' : 'Grandchild'
    if (n === 3) return male ? 'Great-grandson' : female ? 'Great-granddaughter' : 'Great-grandchild'
    const greats = 'Great-'.repeat(n - 2)
    return male ? `${greats}grandson` : female ? `${greats}granddaughter` : `${greats}grandchild`
  }

  const sibIdx = edges.indexOf('SIBLING')
  if (sibIdx !== -1) {
    const up = edges.slice(0, sibIdx)
    const down = edges.slice(sibIdx + 1)
    if (up.every(e => e === 'PARENT') && down.every(e => e === 'CHILD') && up.length >= 1 && down.length >= 1) {
      const degree = Math.min(up.length, down.length)
      const removed = Math.abs(up.length - down.length)
      const ordinal = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][degree - 1] ?? `${degree}th`
      const base = `${ordinal} Cousin`
      return removed === 0 ? base : `${base}, ${removed} time${removed > 1 ? 's' : ''} removed`
    }
  }

  const firstChild = edges.indexOf('CHILD')
  if (firstChild > 0 && edges.slice(firstChild).every(e => e === 'CHILD') && edges.slice(0, firstChild).every(e => e === 'PARENT')) {
    const upCount = firstChild
    const downCount = edges.length - firstChild
    if (upCount === downCount) {
      return `${upCount + downCount}-step relative`
    }
    if (downCount > upCount) {
      const n = downCount - upCount
      const greats = n > 2 ? 'Great-'.repeat(n - 2) : ''
      if (n === 1) return male ? 'Nephew' : female ? 'Niece' : 'Nephew/Niece'
      return male ? `${greats}Grand-nephew` : female ? `${greats}Grand-niece` : `${greats}Grand-nephew/niece`
    }
    const n = upCount - downCount
    const greats = n > 2 ? 'Great-'.repeat(n - 2) : ''
    if (n === 1) return male ? 'Uncle' : female ? 'Aunt' : 'Uncle/Aunt'
    return male ? `${greats}Grand-uncle` : female ? `${greats}Grand-aunt` : `${greats}Grand-uncle/aunt`
  }

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

  const steps: string[] = []
  for (let i = 0; i < edgePath.length - 1; i++) {
    const node = memberMap.get(peoplePath[i + 1])
    if (node) steps.push(edgeStepLabel(edgePath[i], node).toLowerCase())
  }
  const lastLabel = edgeStepLabel(edgePath[edgePath.length - 1], target!).toLowerCase()

  if (steps.length === 0) return `${toName} is ${fromLabel}'s ${lastLabel}.`
  const chain = `${fromLabel}'s ${steps.join("'s ")}`
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

  let cousinDegree: number | null = null
  let removedLevel: number | null = null

  if (lca && (lca.depthA + lca.depthB) > 1 && lca.depthA >= 2 && lca.depthB >= 2) {
    cousinDegree = Math.min(lca.depthA, lca.depthB) - 1
    const diff = Math.abs(lca.depthA - lca.depthB)
    removedLevel = diff > 0 ? diff : null
  } else if (!lca) {
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

function computeConfidence(normalized: string, edgePath: EdgeType[], lca?: LCAResult | null): number {
  const hasSpouse = normalized.includes('SPOUSE')
  if (!hasSpouse && lca) {
    const totalDepth = lca.depthA + lca.depthB
    return Math.max(0.72, 1 - totalDepth * 0.04)
  }
  const inDict = normalized in RELATIONSHIP_MAP
  if (!inDict) return Math.max(0.3, 1 - edgePath.length * 0.08)
  return Math.max(0.72, 1 - edgePath.length * 0.04)
}

const IS_DEV = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'
function dbg(...args: unknown[]) { if (IS_DEV) console.debug('[relationship-engine]', ...args) }

const NOT_FOUND: RelationshipResultNotFound = {
  found: false, relationship: '', path: [], normalized: '', people: [],
  semanticChain: [], chainSentence: '', metadata: null, confidence: 0,
}

export function getRelationshipBetweenPeople(
  members: FamilyMember[],
  fromId: string,
  toId: string,
  fromLabel?: string,
): RelationshipResult {
  if (!fromId || !toId || fromId === toId) return NOT_FOUND

  const memberMap = new Map(members.map(m => [m.id, m]))
  if (!memberMap.has(fromId) || !memberMap.has(toId)) return NOT_FOUND

  const graph = buildRelationshipGraph(members)
  const pathResult = findPath(graph, fromId, toId)
  if (!pathResult || pathResult.edgePath.length === 0) return NOT_FOUND

  const normalized = normalizeEdgePath(pathResult.edgePath)
  const hasSpousePath = normalized.includes('SPOUSE')
  const lca = !hasSpousePath ? findLCA(graph, fromId, toId) : null

  const relationship = resolveLabel(normalized, pathResult.peoplePath, memberMap, lca)
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

export { edgeArrowLabel }
export { resolveLabel as _resolveLabel, edgeStepLabel as _edgeStepLabel }

// ══════════════════════════════════════════════════════════════════════════════
// ── SECTION 2: INVERSE RELATIONSHIP MAP ──────────────────════════════════════
// ══════════════════════════════════════════════════════════════════════════════

type InverseSpec = { male: string; female: string; neutral: string }

const INVERSE_MAP: Record<string, InverseSpec> = {
  'father': { male: 'son', female: 'daughter', neutral: 'child' },
  'mother': { male: 'son', female: 'daughter', neutral: 'child' },
  'parent': { male: 'son', female: 'daughter', neutral: 'child' },
  'son': { male: 'father', female: 'mother', neutral: 'parent' },
  'daughter': { male: 'father', female: 'mother', neutral: 'parent' },
  'child': { male: 'father', female: 'mother', neutral: 'parent' },
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
  'brother': { male: 'brother', female: 'sister', neutral: 'sibling' },
  'sister': { male: 'brother', female: 'sister', neutral: 'sibling' },
  'sibling': { male: 'brother', female: 'sister', neutral: 'sibling' },
  'half-brother': { male: 'half-brother', female: 'half-sister', neutral: 'half-sibling' },
  'half-sister': { male: 'half-brother', female: 'half-sister', neutral: 'half-sibling' },
  'stepbrother': { male: 'stepbrother', female: 'stepsister', neutral: 'step-sibling' },
  'stepsister': { male: 'stepbrother', female: 'stepsister', neutral: 'step-sibling' },
  'husband': { male: 'husband', female: 'wife', neutral: 'spouse' },
  'wife': { male: 'husband', female: 'wife', neutral: 'spouse' },
  'spouse': { male: 'husband', female: 'wife', neutral: 'spouse' },
  'partner': { male: 'partner', female: 'partner', neutral: 'partner' },
  'ex-husband': { male: 'ex-husband', female: 'ex-wife', neutral: 'ex-spouse' },
  'ex-wife': { male: 'ex-husband', female: 'ex-wife', neutral: 'ex-spouse' },
  'stepfather': { male: 'stepson', female: 'stepdaughter', neutral: 'stepchild' },
  'stepmother': { male: 'stepson', female: 'stepdaughter', neutral: 'stepchild' },
  'stepson': { male: 'stepfather', female: 'stepmother', neutral: 'stepparent' },
  'stepdaughter': { male: 'stepfather', female: 'stepmother', neutral: 'stepparent' },
  'adopted-son': { male: 'adoptive-father', female: 'adoptive-mother', neutral: 'adoptive-parent' },
  'adopted-daughter': { male: 'adoptive-father', female: 'adoptive-mother', neutral: 'adoptive-parent' },
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
  'nephew': { male: 'uncle', female: 'aunt', neutral: 'uncle/aunt' },
  'niece': { male: 'uncle', female: 'aunt', neutral: 'uncle/aunt' },
  'grand-nephew': { male: 'great-uncle', female: 'great-aunt', neutral: 'great-uncle/aunt' },
  'grand-niece': { male: 'great-uncle', female: 'great-aunt', neutral: 'great-uncle/aunt' },
  'father-in-law': { male: 'son-in-law', female: 'daughter-in-law', neutral: 'child-in-law' },
  'mother-in-law': { male: 'son-in-law', female: 'daughter-in-law', neutral: 'child-in-law' },
  'son-in-law': { male: 'father-in-law', female: 'mother-in-law', neutral: 'parent-in-law' },
  'daughter-in-law': { male: 'father-in-law', female: 'mother-in-law', neutral: 'parent-in-law' },
  'brother-in-law': { male: 'brother-in-law', female: 'sister-in-law', neutral: 'sibling-in-law' },
  'sister-in-law': { male: 'brother-in-law', female: 'sister-in-law', neutral: 'sibling-in-law' },
  'first-cousin': { male: 'first-cousin', female: 'first-cousin', neutral: 'first-cousin' },
  'second-cousin': { male: 'second-cousin', female: 'second-cousin', neutral: 'second-cousin' },
  'third-cousin': { male: 'third-cousin', female: 'third-cousin', neutral: 'third-cousin' },
  'first-cousin-once-removed': { male: 'first-cousin-once-removed', female: 'first-cousin-once-removed', neutral: 'first-cousin-once-removed' },
  'cousin-in-law': { male: 'cousin-in-law', female: 'cousin-in-law', neutral: 'cousin-in-law' },
  'godfather': { male: 'godson', female: 'goddaughter', neutral: 'godchild' },
  'godmother': { male: 'godson', female: 'goddaughter', neutral: 'godchild' },
  'godson': { male: 'godfather', female: 'godmother', neutral: 'godparent' },
  'goddaughter': { male: 'godfather', female: 'godmother', neutral: 'godparent' },
}

export function getInverseRelationship(relationship: string, recipientGender: FamilyMember['gender']): string {
  const key = relationship.toLowerCase().trim()
  const spec = INVERSE_MAP[key]
  if (!spec) return 'relative'
  if (recipientGender === 'male') return spec.male
  if (recipientGender === 'female') return spec.female
  return spec.neutral
}

// ─── Suggestions Engine ──────────────────────────────────────────────────────

export type RelationshipSuggestionKind = 'sibling' | 'spouse' | 'in-law' | 'extended'

export interface RelationshipSuggestion {
  id: string
  kind: RelationshipSuggestionKind
  fromId: string
  toId: string
  fromName: string
  toName: string
  label: string
  reason: string
  confidence: 'high' | 'medium'
  actions: RelationshipAction[]
}

export interface RelationshipAction {
  memberId: string
  field: 'spouseIds' | 'parentIds'
  operation: 'add'
  value: string
}

export function inferCoParentSpouseSuggestions(members: FamilyMember[], focusId?: string): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()

  for (const child of members) {
    if ((child.parentIds ?? []).length < 2) continue

    const parents = child.parentIds
      .map(pid => members.find(m => m.id === pid))
      .filter((m): m is FamilyMember => !!m)

    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        const a = parents[i]
        const b = parents[j]
        if ((a.spouseIds ?? []).includes(b.id) || (b.spouseIds ?? []).includes(a.id)) continue

        const key = [a.id, b.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        if (focusId && a.id !== focusId && b.id !== focusId) continue

        const sharedChildren = members.filter(
          c => (c.parentIds ?? []).includes(a.id) && (c.parentIds ?? []).includes(b.id)
        )
        const childWord = sharedChildren.length === 1 ? child.name : `${sharedChildren.length} children`

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
      }
    }
  }
  return results
}

export function inferSiblingLabelSuggestions(members: FamilyMember[], focusId?: string): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]
      const b = members[j]
      if (!(a.parentIds ?? []).length || !(b.parentIds ?? []).length) continue

      const sharedParents = a.parentIds.filter(pid => b.parentIds.includes(pid))
      if (sharedParents.length === 0) continue

      const key = [a.id, b.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)

      if (focusId && a.id !== focusId && b.id !== focusId) continue

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
        actions: [],
      })
    }
  }
  return results
}

export function inferInLawSuggestions(members: FamilyMember[], focusId?: string): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()
  const map = new Map(members.map(m => [m.id, m]))
  const focusMembers = focusId ? members.filter(m => m.id === focusId) : members

  for (const focus of focusMembers) {
    for (const spouseId of (focus.spouseIds ?? [])) {
      const spouse = map.get(spouseId)
      if (!spouse) continue

      for (const parentId of (spouse.parentIds ?? [])) {
        const parent = map.get(parentId)
        if (!parent) continue
        const key = [focus.id, parent.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const label = parent.gender === 'male' ? 'father-in-law' : parent.gender === 'female' ? 'mother-in-law' : 'parent-in-law'

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

      if ((spouse.parentIds ?? []).length > 0) {
        const spouseSiblings = members.filter(m =>
          m.id !== spouse.id &&
          m.id !== focus.id &&
          (m.parentIds ?? []).some(pid => spouse.parentIds.includes(pid)),
        )
        for (const sibling of spouseSiblings) {
          const key = [focus.id, sibling.id].sort().join('|')
          if (seen.has(key)) continue
          seen.add(key)

          const label = sibling.gender === 'male' ? 'brother-in-law' : sibling.gender === 'female' ? 'sister-in-law' : 'sibling-in-law'

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

export function inferExtendedFamilySuggestions(members: FamilyMember[], focusId?: string): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()
  const map = new Map(members.map(m => [m.id, m]))
  const focusMembers = focusId ? members.filter(m => m.id === focusId) : members

  for (const focus of focusMembers) {
    for (const parentId of (focus.parentIds ?? [])) {
      const parent = map.get(parentId)
      if (!parent) continue
      const side = parent.gender === 'male' ? 'paternal' : parent.gender === 'female' ? 'maternal' : ''

      for (const gpId of (parent.parentIds ?? [])) {
        const gp = map.get(gpId)
        if (!gp) continue
        const key = [focus.id, gp.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const gpLabel = gp.gender === 'male' ? 'grandfather' : gp.gender === 'female' ? 'grandmother' : 'grandparent'
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

      if ((parent.parentIds ?? []).length > 0) {
        const parentSiblings = members.filter(m =>
          m.id !== parent.id &&
          m.id !== focus.id &&
          (m.parentIds ?? []).some(pid => parent.parentIds.includes(pid)),
        )
        for (const pSibling of parentSiblings) {
          const key = [focus.id, pSibling.id].sort().join('|')
          if (seen.has(key)) continue
          seen.add(key)

          const auLabel = pSibling.gender === 'male' ? 'uncle' : pSibling.gender === 'female' ? 'aunt' : 'uncle/aunt'
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

export function inferNieceNephewSuggestions(members: FamilyMember[], focusId?: string): RelationshipSuggestion[] {
  const results: RelationshipSuggestion[] = []
  const seen = new Set<string>()
  const focusMembers = focusId ? members.filter(m => m.id === focusId) : members

  for (const focus of focusMembers) {
    if (!(focus.parentIds ?? []).length) continue

    const focusSiblings = members.filter(
      m => m.id !== focus.id && (m.parentIds ?? []).some(pid => focus.parentIds.includes(pid)),
    )

    for (const sibling of focusSiblings) {
      const siblingChildren = members.filter(m => (m.parentIds ?? []).includes(sibling.id))
      for (const child of siblingChildren) {
        if (child.id === focus.id) continue
        const key = [focus.id, child.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const label = child.gender === 'male' ? 'nephew' : child.gender === 'female' ? 'niece' : 'nephew/niece'

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

export function computePostAddSuggestions(newMemberId: string, allMembers: FamilyMember[]): RelationshipSuggestion[] {
  const memberMap = new Map(allMembers.map(m => [m.id, m]))

  const raw: RelationshipSuggestion[] = [
    ...inferCoParentSpouseSuggestions(allMembers, newMemberId),
    ...inferSiblingLabelSuggestions(allMembers, newMemberId),
    ...inferInLawSuggestions(allMembers, newMemberId),
    ...inferExtendedFamilySuggestions(allMembers, newMemberId),
    ...inferNieceNephewSuggestions(allMembers, newMemberId),
  ]

  const seenPairs = new Set<string>()
  const deduped = raw.filter(s => {
    const key = [s.fromId, s.toId].sort().join('|')
    if (seenPairs.has(key)) return false
    seenPairs.add(key)
    return true
  })

  const withoutDeceasedActions = deduped.filter(s => {
    if (s.actions.length === 0) return true
    const toMember = memberMap.get(s.toId)
    const fromMember = memberMap.get(s.fromId)
    const toDeceased = !!(toMember?.isDeceased || toMember?.deathYear)
    const fromDeceased = !!(fromMember?.isDeceased || fromMember?.deathYear)
    return !toDeceased && !fromDeceased
  })

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

export function validateGraphConsistency(members: FamilyMember[]): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = []
  const map = new Map(members.map(m => [m.id, m]))

  for (const m of members) {
    if ((m.parentIds ?? []).includes(m.id)) {
      warnings.push({ memberId: m.id, memberName: m.name, message: 'Listed as their own parent.' })
    }
    if ((m.spouseIds ?? []).includes(m.id)) {
      warnings.push({ memberId: m.id, memberName: m.name, message: 'Listed as their own spouse.' })
    }
    for (const pid of (m.parentIds ?? [])) {
      const parent = map.get(pid)
      if (parent && (parent.parentIds ?? []).includes(m.id)) {
        warnings.push({
          memberId: m.id, memberName: m.name,
          message: `Circular parent-child relationship with ${parent.name}.`,
        })
      }
    }
    for (const sid of (m.spouseIds ?? [])) {
      const spouse = map.get(sid)
      if (spouse && !(spouse.spouseIds ?? []).includes(m.id)) {
        warnings.push({
          memberId: m.id, memberName: m.name,
          message: `One-directional spouse link with ${spouse.name} — may need repair.`,
        })
      }
    }

    if (m.birthYear) {
      for (const pid of (m.parentIds ?? [])) {
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

      for (const sid of (m.spouseIds ?? [])) {
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
