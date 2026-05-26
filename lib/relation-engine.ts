/**
 * Relation Engine
 * Computes human-readable relationship labels between two family members.
 * Uses BFS with edge-type encoding to map paths to Indian/English labels.
 */

import type { FamilyMember } from './types'

type EdgeType = 'UP' | 'DOWN' | 'SPOUSE' | 'SIB'

interface PathEdge {
  memberId: string
  edge: EdgeType
}

// ─── Adjacency Pre-computation ────────────────────────────────────────────────

interface Adjacency {
  childrenOf: Map<string, string[]>
  siblingsOf: Map<string, Set<string>>
  spousesOf: Map<string, Set<string>>
}

/**
 * Pre-computes parent→children, member→siblings, and bidirectional spouse maps.
 * Siblings: any two members sharing ≥1 parentId get a SIB edge in BFS.
 * Spouses: bidirectional regardless of which side stores the link.
 * O(n · avg_children) time and space — fast for any real family size.
 */
function buildAdjacency(members: FamilyMember[]): Adjacency {
  const childrenOf = new Map<string, string[]>()
  const siblingsOf = new Map<string, Set<string>>()
  const spousesOf = new Map<string, Set<string>>()

  for (const m of members) {
    siblingsOf.set(m.id, new Set())
    spousesOf.set(m.id, new Set())
  }

  for (const m of members) {
    for (const pid of m.parentIds) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, [])
      childrenOf.get(pid)!.push(m.id)
    }
    for (const sid of m.spouseIds) {
      spousesOf.get(m.id)!.add(sid)
      if (!spousesOf.has(sid)) spousesOf.set(sid, new Set())
      spousesOf.get(sid)!.add(m.id)
    }
  }

  // Materialize SIB edges: any two children of the same parent are siblings
  for (const children of childrenOf.values()) {
    for (const a of children) {
      for (const b of children) {
        if (a !== b) siblingsOf.get(a)?.add(b)
      }
    }
  }

  return { childrenOf, siblingsOf, spousesOf }
}

// ─── BFS with edge tracking ───────────────────────────────────────────────────

export function findRelationshipPath(
  fromId: string,
  toId: string,
  members: FamilyMember[]
): FamilyMember[] | null {
  if (fromId === toId) return []
  const memberMap = new Map(members.map(m => [m.id, m]))
  const adj = buildAdjacency(members)
  const visited = new Set<string>()
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }]

  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    if (id === toId) return path.map(i => memberMap.get(i)!).filter(Boolean)
    const m = memberMap.get(id)
    if (!m) continue
    const neighbors: string[] = [
      ...m.parentIds,
      ...(adj.childrenOf.get(id) ?? []),
      ...[...(adj.spousesOf.get(id) ?? [])],
      ...[...(adj.siblingsOf.get(id) ?? [])],
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
  const adj = buildAdjacency(members)
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

    // UP: to parents
    for (const pid of m.parentIds) {
      if (!visited.has(pid))
        queue.push({ id: pid, edges: [...edges, { memberId: pid, edge: 'UP' }] })
    }
    // DOWN: to children (via adjacency — avoids O(n) filter per node)
    for (const cid of adj.childrenOf.get(id) ?? []) {
      if (!visited.has(cid))
        queue.push({ id: cid, edges: [...edges, { memberId: cid, edge: 'DOWN' }] })
    }
    // SPOUSE: bidirectional via adjacency (handles cases where only one side stores the link)
    for (const sid of adj.spousesOf.get(id) ?? []) {
      if (!visited.has(sid))
        queue.push({ id: sid, edges: [...edges, { memberId: sid, edge: 'SPOUSE' }] })
    }
    // SIB: members sharing ≥1 parentId — 1-hop shortcut replacing UP,DOWN for siblings
    for (const sibId of adj.siblingsOf.get(id) ?? []) {
      if (!visited.has(sibId))
        queue.push({ id: sibId, edges: [...edges, { memberId: sibId, edge: 'SIB' }] })
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

// ─── Relationship Pattern Dictionary ─────────────────────────────────────────
//
// Maps BFS edge sequences to human-readable labels.
// SIB edges are materialized at BFS time from shared parentIds (buildAdjacency).
//
// Priority rules in computeRelationLabel:
//   1. Uncle/aunt get special-cased first for paternal/maternal disambiguation
//   2. Dictionary lookup on full edge-sequence string
//   3. Gender of TARGET member selects male/female variant (fallback: neutral)
//   4. Unrecognised sequence → "${n}-step relative"
//
// Legacy UP/DOWN-only patterns (marked "Legacy") are kept as fallbacks for
// edge-cases where SIB edges cannot be materialized (isolated/incomplete data).
// ─────────────────────────────────────────────────────────────────────────────

interface PatternLabel {
  neutral: string
  male?: string
  female?: string
}

const RELATIONSHIP_PATTERNS: Record<string, PatternLabel> = {
  // ── 1-step ────────────────────────────────────────────────────────────────
  'UP':                    { neutral: 'Parent',                   male: 'Father',                       female: 'Mother' },
  'DOWN':                  { neutral: 'Child',                    male: 'Son',                          female: 'Daughter' },
  'SPOUSE':                { neutral: 'Spouse',                   male: 'Husband',                      female: 'Wife' },
  'SIB':                   { neutral: 'Sibling',                  male: 'Brother',                      female: 'Sister' },
  // ── 2-step ────────────────────────────────────────────────────────────────
  'UP,UP':                 { neutral: 'Grandparent',              male: 'Grandfather (Dada/Nana)',       female: 'Grandmother (Dadi/Nani)' },
  'DOWN,DOWN':             { neutral: 'Grandchild',               male: 'Grandson',                     female: 'Granddaughter' },
  'UP,SIB':                { neutral: 'Uncle/Aunt',               male: 'Uncle',                        female: 'Aunt' },
  'SIB,DOWN':              { neutral: 'Nephew/Niece',             male: 'Nephew (Bhatija/Bhanja)',       female: 'Niece (Bhatiji/Bhanji)' },
  'SPOUSE,UP':             { neutral: 'Parent-in-law',            male: 'Father-in-law',                female: 'Mother-in-law' },
  'DOWN,SPOUSE':           { neutral: 'Child-in-law',             male: 'Son-in-law',                   female: 'Daughter-in-law' },
  'SPOUSE,SIB':            { neutral: 'Sibling-in-law',           male: 'Brother-in-law (Saala/Devar)', female: 'Sister-in-law (Saali/Nanad)' },
  'SIB,SPOUSE':            { neutral: "Sibling's Spouse",         male: 'Jija (Didi ka Pati)',           female: 'Bhabhi (Bhai ki Patni)' },
  'UP,SPOUSE':             { neutral: 'Step-parent',              male: 'Step-father',                  female: 'Step-mother' },
  'SPOUSE,DOWN':           { neutral: 'Step-child',               male: 'Step-son',                     female: 'Step-daughter' },
  'SPOUSE,SPOUSE':         { neutral: 'Co-spouse (Sautan/Sauta)' },
  // Legacy 2-step (BFS prefers SIB shortcut; these handle isolated/incomplete data)
  'UP,DOWN':               { neutral: 'Sibling',                  male: 'Brother',                      female: 'Sister' },
  'DOWN,UP':               { neutral: 'Sibling',                  male: 'Brother',                      female: 'Sister' },
  // ── 3-step ────────────────────────────────────────────────────────────────
  'UP,UP,UP':              { neutral: 'Great-grandparent',        male: 'Great-grandfather',            female: 'Great-grandmother' },
  'DOWN,DOWN,DOWN':        { neutral: 'Great-grandchild',         male: 'Great-grandson',               female: 'Great-granddaughter' },
  'UP,SIB,DOWN':           { neutral: 'First Cousin',             male: 'First Cousin (Bhai)',          female: 'First Cousin (Didi)' },
  'SPOUSE,SIB,SPOUSE':     { neutral: 'Co-sibling-in-law',        male: 'Co-brother',                   female: 'Co-sister' },
  'UP,SIB,SPOUSE':         { neutral: "Uncle/Aunt's Spouse",      male: 'Fua (Bua ka Pati)',            female: 'Chachi/Mausi' },
  'SIB,DOWN,DOWN':         { neutral: 'Grand-nephew/niece',       male: 'Grand-nephew',                 female: 'Grand-niece' },
  'UP,UP,SIB':             { neutral: 'Great-uncle/aunt',         male: 'Great-uncle',                  female: 'Great-aunt' },
  'SPOUSE,SIB,DOWN':       { neutral: "Spouse's Nephew/Niece",    male: "Spouse's Nephew",              female: "Spouse's Niece" },
  'SIB,DOWN,SPOUSE':       { neutral: "Nephew/Niece's Spouse" },
  'UP,SPOUSE,DOWN':        { neutral: 'Step-sibling',             male: 'Step-brother',                 female: 'Step-sister' },
  'DOWN,DOWN,SPOUSE':      { neutral: 'Grandchild-in-law',        male: 'Grandson-in-law',              female: 'Granddaughter-in-law' },
  'DOWN,SPOUSE,UP':        { neutral: "Child's In-law" },
  // Legacy 3-step
  'UP,UP,DOWN':            { neutral: 'Uncle/Aunt',               male: 'Uncle',                        female: 'Aunt' },
  'UP,DOWN,DOWN':          { neutral: 'Nephew/Niece',             male: 'Nephew (Bhatija/Bhanja)',       female: 'Niece (Bhatiji/Bhanji)' },
  'SPOUSE,UP,DOWN':        { neutral: 'Sibling-in-law',           male: 'Brother-in-law (Saala/Devar)', female: 'Sister-in-law (Saali/Nanad)' },
  'UP,DOWN,SPOUSE':        { neutral: "Sibling's Spouse",         male: 'Jija',                         female: 'Bhabhi' },
  'DOWN,DOWN,UP':          { neutral: 'Nephew/Niece',             male: 'Nephew',                       female: 'Niece' },
  'UP,UP,SPOUSE':          { neutral: 'Grandparent',              male: 'Grandfather',                  female: 'Grandmother' },
  'UP,SPOUSE,UP':          { neutral: 'Grandparent (in-law)' },
  'SPOUSE,DOWN,DOWN':      { neutral: 'Step-grandchild',          male: 'Grandson (step)',              female: 'Granddaughter (step)' },
  // ── 4-step ────────────────────────────────────────────────────────────────
  'UP,UP,SIB,DOWN':        { neutral: 'Second Cousin' },
  'UP,SIB,DOWN,DOWN':      { neutral: "First Cousin's Child" },
  'UP,SIB,DOWN,SPOUSE':    { neutral: "First Cousin's Spouse" },
  'UP,UP,SIB,SPOUSE':      { neutral: 'Uncle/Aunt by marriage' },
  'SIB,DOWN,DOWN,DOWN':    { neutral: 'Great-grand-nephew/niece', male: 'Great-grand-nephew',           female: 'Great-grand-niece' },
  // Legacy 4-step
  'UP,UP,DOWN,DOWN':       { neutral: 'First Cousin',             male: 'First Cousin (Bhai)',          female: 'First Cousin (Behen)' },
  'UP,UP,DOWN,SPOUSE':     { neutral: 'Uncle/Aunt by marriage',   male: 'Uncle (by marriage)',          female: 'Aunt (by marriage)' },
  'SPOUSE,UP,DOWN,DOWN':   { neutral: "Spouse's Nephew/Niece",    male: 'Nephew-in-law (Bhatija)',      female: 'Niece-in-law (Bhatiji)' },
  'UP,DOWN,DOWN,SPOUSE':   { neutral: "Nephew/Niece's Spouse",    male: 'Nephew-in-law',               female: 'Niece-in-law' },
  // ── 5-step ────────────────────────────────────────────────────────────────
  'UP,UP,SIB,DOWN,DOWN':   { neutral: "Second Cousin's Child" },
  'UP,SIB,DOWN,DOWN,DOWN': { neutral: "First Cousin's Grandchild" },
}

/**
 * Returns a human-readable relationship label between two family members.
 * Uses BFS path → edge sequence → RELATIONSHIP_PATTERNS dictionary.
 * e.g. "Father", "Paternal Uncle (Chacha/Tau)", "Co-sister", "First Cousin (Bhai)"
 * Falls back to "N-step relative" for unrecognised paths.
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

  // ── Paternal / maternal uncle-aunt disambiguation ──────────────────────────
  // The parent's gender tells us which side of the family the uncle/aunt is on.
  // 'UP,SIB' = primary path (parent → parent's sibling)
  // 'UP,UP,DOWN' = legacy path for the same relationship
  if (seq === 'UP,SIB' || seq === 'UP,UP,DOWN') {
    const parent = memberMap.get(edges[0].memberId)
    if (parent) {
      const parentIsMale = isMale(parent)
      const parentIsFemale = isFemale(parent)
      if (male) return parentIsMale ? 'Paternal Uncle (Chacha/Tau)' : parentIsFemale ? 'Maternal Uncle (Mama)' : 'Uncle'
      if (female) return parentIsMale ? 'Paternal Aunt (Bua)' : parentIsFemale ? 'Maternal Aunt (Mausi/Mami)' : 'Aunt'
    }
    return male ? 'Uncle' : female ? 'Aunt' : 'Uncle/Aunt'
  }

  // ── Dictionary look-up ─────────────────────────────────────────────────────
  const pattern = RELATIONSHIP_PATTERNS[seq]
  if (!pattern) return `${edges.length}-step relative`
  if (male && pattern.male) return pattern.male
  if (female && pattern.female) return pattern.female
  return pattern.neutral
}

// ─── Graph Edge Enrichment from Relationship Labels ──────────────────────────
//
// Members often have only a `relationship` label set (e.g. `relationship:'uncle'`)
// without structural graph edges (parentIds / spouseIds). This function derives
// virtual edges so BFS can traverse between ANY two people, even when exact
// intermediate nodes were never explicitly stored.
//
// Virtual nodes (prefixed __virt_) are transparent to the UI — members.find()
// returns undefined for them, so they are silently skipped in rendering.
// ─────────────────────────────────────────────────────────────────────────────

function makeVirtMember(id: string, pIds: string[], sIds: string[]): FamilyMember {
  return { id, name: '', parentIds: pIds, spouseIds: sIds, generation: 0 } as unknown as FamilyMember
}

/**
 * Returns a copy of `members` augmented with:
 *  - Derived parentIds / spouseIds for isolated members (no structural edges)
 *  - Singleton virtual intermediate nodes used as structural anchors
 *
 * All relationship labels are assumed relative to the `selfId` member
 * (the logged-in user), matching how they are stored in the database.
 */
export function enrichMembersWithDerivedEdges(
  members: FamilyMember[],
  selfId?: string | null,
): FamilyMember[] {
  const self = selfId
    ? members.find(m => m.id === selfId)
    : members.find(m => m.relationship === 'self')
  if (!self) return members

  const sid = self.id

  const isIsolated = (m: FamilyMember): boolean => {
    if (m.parentIds.length > 0 || m.spouseIds.length > 0) return false
    return !members.some(o => o.parentIds.includes(m.id) || o.spouseIds.includes(m.id))
  }

  const extras = new Map<string, { parentIds: string[]; spouseIds: string[] }>()
  const virtuals: FamilyMember[] = []
  const virtCreated = new Set<string>()

  const getEx = (id: string) => {
    if (!extras.has(id)) extras.set(id, { parentIds: [], spouseIds: [] })
    return extras.get(id)!
  }
  const addP = (childId: string, parentId: string) => {
    const e = getEx(childId)
    if (!e.parentIds.includes(parentId)) e.parentIds.push(parentId)
  }
  const addSp = (a: string, b: string) => {
    const ea = getEx(a); const eb = getEx(b)
    if (!ea.spouseIds.includes(b)) ea.spouseIds.push(b)
    if (!eb.spouseIds.includes(a)) eb.spouseIds.push(a)
  }
  const ensureVirt = (id: string, pIds: string[], sIds: string[]) => {
    if (!virtCreated.has(id)) { virtCreated.add(id); virtuals.push(makeVirtMember(id, pIds, sIds)) }
  }

  // Singleton virtual anchors — one per self, shared across all isolated members
  const VP = `__virt_p_${sid}`    // virtual parent of self
  const VGP = `__virt_gp_${sid}`   // virtual grandparent of self
  const VS = `__virt_sib_${sid}`  // virtual sibling of self
  const VSP = `__virt_sp_${sid}`   // virtual spouse of self
  const VC = `__virt_ch_${sid}`   // virtual child of self
  const VU = `__virt_unc_${sid}`  // virtual uncle of self (child of VGP)
  const VSPP = `__virt_spp_${sid}`  // virtual parent of self's spouse

  let vpReady = false, vgpReady = false, vsReady = false
  let vspReady = false, vcReady = false, vuReady = false, vsppReady = false

  const getSelfParentId = (): string => {
    if (self.parentIds.length > 0) return self.parentIds[0]
    const overrideP = extras.get(sid)?.parentIds
    if (overrideP?.length) return overrideP[0]
    if (!vpReady) { vpReady = true; ensureVirt(VP, [], []); addP(sid, VP) }
    return VP
  }

  const getSelfGrandparentId = (): string => {
    const pid = getSelfParentId()
    const realParent = members.find(m => m.id === pid)
    if (realParent?.parentIds.length) return realParent.parentIds[0]
    const ov = extras.get(pid)?.parentIds
    if (ov?.length) return ov[0]
    if (!vgpReady) { vgpReady = true; ensureVirt(VGP, [], []); addP(pid, VGP) }
    return VGP
  }

  const getSelfSiblingId = (): string => {
    const pid = getSelfParentId()
    if (!vsReady) { vsReady = true; ensureVirt(VS, [pid], []) }
    return VS
  }

  const getSelfSpouseId = (): string => {
    if (self.spouseIds.length > 0) return self.spouseIds[0]
    const rev = members.find(m => m.spouseIds.includes(sid))
    if (rev) return rev.id
    const ovSp = extras.get(sid)?.spouseIds
    if (ovSp?.length) return ovSp[0]
    if (!vspReady) { vspReady = true; ensureVirt(VSP, [], [sid]); addSp(sid, VSP) }
    return VSP
  }

  const getSelfChildId = (): string => {
    const existing = members.find(m => m.parentIds.includes(sid))
    if (existing) return existing.id
    if (!vcReady) { vcReady = true; ensureVirt(VC, [sid], []) }
    return VC
  }

  const getSelfUncleId = (): string => {
    const gp = getSelfGrandparentId()
    if (!vuReady) { vuReady = true; ensureVirt(VU, [gp], []) }
    return VU
  }

  const getSpouseParentId = (): string => {
    const spId = getSelfSpouseId()
    const sp = members.find(m => m.id === spId)
    if (sp?.parentIds.length) return sp.parentIds[0]
    const ov = extras.get(spId)?.parentIds
    if (ov?.length) return ov[0]
    if (!vsppReady) { vsppReady = true; ensureVirt(VSPP, [], []); addP(spId, VSPP) }
    return VSPP
  }

  for (const m of members) {
    if (m.id === sid) continue
    if (!isIsolated(m)) continue

    const rel = (m.relationship ?? '')
      .toLowerCase()
      .replace(/[^a-z-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    if (['father', 'mother', 'parent'].includes(rel)) {
      // m is self's parent
      addP(sid, m.id)
    } else if (['son', 'daughter', 'child'].includes(rel)) {
      addP(m.id, sid)
    } else if (['husband', 'wife', 'spouse'].includes(rel)) {
      addSp(sid, m.id)
    } else if (['brother', 'sister', 'sibling'].includes(rel)) {
      addP(m.id, getSelfParentId())
    } else if (rel.includes('grandfather') || rel.includes('grandmother') || rel === 'grandparent') {
      addP(getSelfParentId(), m.id)
    } else if (['great-grandfather', 'great-grandmother', 'great-grandparent'].some(r => rel.includes(r.split('-')[1]!) && rel.includes('great'))) {
      addP(getSelfGrandparentId(), m.id)
    } else if (['grandson', 'granddaughter', 'grandchild'].includes(rel)) {
      addP(m.id, getSelfChildId())
    } else if (rel === 'uncle' || rel === 'aunt' || rel.startsWith('uncle') || rel.startsWith('aunt')
      || rel.includes('paternal-uncle') || rel.includes('maternal-uncle')
      || rel.includes('paternal-aunt') || rel.includes('maternal-aunt')) {
      // m is a sibling of self's parent → shares grandparent
      addP(m.id, getSelfGrandparentId())
    } else if (rel === 'nephew' || rel === 'niece') {
      // m is child of self's sibling
      addP(m.id, getSelfSiblingId())
    } else if (['father-in-law', 'mother-in-law', 'parent-in-law'].includes(rel)) {
      addP(getSelfSpouseId(), m.id)
    } else if (['son-in-law', 'daughter-in-law', 'child-in-law'].includes(rel)) {
      addSp(m.id, getSelfChildId())
    } else if (['brother-in-law', 'sister-in-law', 'sibling-in-law'].includes(rel)) {
      // m is sibling of self's spouse → share a parent
      addP(m.id, getSpouseParentId())
    } else if (['cousin', 'first-cousin', 'second-cousin'].includes(rel)) {
      // m is child of self's uncle (parent's sibling)
      addP(m.id, getSelfUncleId())
    } else {
      // Unknown / complex label: place adjacent to self's parent as a conservative fallback
      addP(m.id, getSelfParentId())
    }
  }

  if (extras.size === 0 && virtuals.length === 0) return members

  const enriched = members.map(m => {
    const e = extras.get(m.id)
    if (!e) return m
    return {
      ...m,
      parentIds: [...new Set([...m.parentIds, ...e.parentIds])],
      spouseIds: [...new Set([...m.spouseIds, ...e.spouseIds])],
    }
  })

  const enrichedVirtuals = virtuals.map(v => {
    const e = extras.get(v.id)
    if (!e) return v
    return {
      ...v,
      parentIds: [...new Set([...v.parentIds, ...e.parentIds])],
      spouseIds: [...new Set([...v.spouseIds, ...e.spouseIds])],
    }
  })

  return [...enriched, ...enrichedVirtuals]
}

// ─── Semantic Relationship Intelligence ──────────────────────────────────────
//
// Builds a rich, structured description of how two people are related:
//  • Canonical label ("First Cousin", "Paternal Uncle")
//  • Step-by-step chain (["Father", "Brother", "Son"])
//  • Human-readable sentence ("Sanjay is your father's brother's son")
//  • Metadata (side, type, generation delta, cousin degree, confidence)
//
// The "compressed chain" skips the pivot ancestor (MRCA) to produce the
// natural verbal form: father's brother's son, not father's father's son's son.
// ─────────────────────────────────────────────────────────────────────────────

export interface RelationPathNode {
  member: FamilyMember
  /** Relationship label describing how to arrive at this node from the previous */
  stepLabel: string
  edgeType: EdgeType | 'START'
}

export interface RelationMetadata {
  /** Family side based on first UP edge direction (paternal/maternal) or SPOUSE */
  side: 'paternal' | 'maternal' | 'spouse' | 'mixed' | null
  /** blood = all UP/DOWN; marriage = has SPOUSE edges; mixed = both */
  type: 'blood' | 'marriage' | 'mixed'
  /** to.generation − from.generation. Positive = target is in an older generation */
  generationDelta: number
  /** For cousins: 1 = first, 2 = second, null otherwise */
  cousinDegree: number | null
  /** For removed cousins: 1 = once removed, 2 = twice, null = not removed */
  removedLevel: number | null
  hopCount: number
}

export interface SemanticRelationship {
  found: boolean
  /** e.g. "First Cousin", "Paternal Uncle (Chacha/Tau)" */
  canonicalLabel: string
  /** Raw step labels per graph edge: ["Father", "Father", "Son", "Son"] */
  chain: string[]
  /** Compressed human-readable labels: ["Father", "Brother", "Son"] */
  semanticChain: string[]
  /** e.g. "Sanjay is your father's brother's son" */
  chainSentence: string
  /** Full annotated traversal path (all raw graph nodes) */
  pathWithLabels: RelationPathNode[]
  metadata: RelationMetadata
  /** 0–1 confidence in the semantic interpretation */
  confidence: number
}

// Single-step edge label based on edge direction + target gender
function edgeStepLabel(edgeType: EdgeType, target: FamilyMember): string {
  const m = isMale(target), f = isFemale(target)
  if (edgeType === 'UP')    return m ? 'Father'  : f ? 'Mother'  : 'Parent'
  if (edgeType === 'DOWN')  return m ? 'Son'     : f ? 'Daughter': 'Child'
  if (edgeType === 'SIB')   return m ? 'Brother' : f ? 'Sister'  : 'Sibling'
  /* SPOUSE */               return m ? 'Husband' : f ? 'Wife'    : 'Spouse'
}

/**
 * Build a compressed semantic chain by removing the MRCA pivot node.
 *
 * Example: raw path [Rahul, Sukhdeo, Grandfather, Motiram, Sanjay]
 *   → compressed [Rahul, Sukhdeo, Motiram, Sanjay]
 *   → pairwise labels: Father, Brother, Son
 *
 * Only compresses if there is exactly one UP→DOWN boundary (standard case).
 * Multi-pivot paths (complex step families) are returned as-is.
 */
function buildSemanticChain(
  rawPath: FamilyMember[],
  edges: PathEdge[],
  members: FamilyMember[],
): string[] {
  if (rawPath.length <= 1) return []
  if (rawPath.length === 2) {
    const label = computeRelationLabel(rawPath[0].id, rawPath[1].id, members)
    return label ? [label] : []
  }

  // Identify UP→DOWN transition indices (0-based in edges array)
  const transitions: number[] = []
  for (let i = 1; i < edges.length; i++) {
    if (edges[i - 1].edge === 'UP' && edges[i].edge === 'DOWN') transitions.push(i)
  }

  let condensedPath: FamilyMember[]
  if (transitions.length === 1) {
    // pivotIdx in rawPath = transitions[0] (since rawPath[j] is reached via edges[j-1])
    const pivotIdx = transitions[0]
    condensedPath = [...rawPath.slice(0, pivotIdx), ...rawPath.slice(pivotIdx + 1)]
  } else {
    // No compression for complex multi-pivot paths or pure up/down/spouse chains
    condensedPath = rawPath
  }

  const labels: string[] = []
  for (let i = 0; i < condensedPath.length - 1; i++) {
    const label = computeRelationLabel(condensedPath[i].id, condensedPath[i + 1].id, members)
    labels.push(label ?? condensedPath[i + 1].name)
  }
  return labels
}

function buildRelationMetadata(
  edges: PathEdge[],
  from: FamilyMember,
  to: FamilyMember,
): RelationMetadata {
  const hasSpouse = edges.some(e => e.edge === 'SPOUSE')
  // SIB edges are blood relations (derived from shared parentIds)
  const allBlood = edges.every(e => e.edge === 'UP' || e.edge === 'DOWN' || e.edge === 'SIB')
  const type: 'blood' | 'marriage' | 'mixed' = allBlood ? 'blood' : hasSpouse && !allBlood ? (edges.some(e => e.edge !== 'SPOUSE') ? 'mixed' : 'marriage') : 'mixed'

  let side: 'paternal' | 'maternal' | 'spouse' | 'mixed' | null = null
  if (edges[0]?.edge === 'SPOUSE') side = 'spouse'
  // Side resolved from canonical label later (more reliable)

  const generationDelta = (to.generation ?? 0) - (from.generation ?? 0)

  const upCount = edges.filter(e => e.edge === 'UP').length
  const downCount = edges.filter(e => e.edge === 'DOWN').length
  const sibCount = edges.filter(e => e.edge === 'SIB').length
  let cousinDegree: number | null = null
  let removedLevel: number | null = null

  // Cousin via SIB shortcut: UP{n},SIB,DOWN{m} — upCount-th cousin, |n-m|-removed
  if (!hasSpouse && sibCount >= 1 && upCount >= 1 && downCount >= 1) {
    cousinDegree = upCount
    const diff = Math.abs(upCount - downCount)
    removedLevel = diff > 0 ? diff : null
  } else if (!hasSpouse && upCount >= 2 && downCount >= 2) {
    // Legacy path: UP,UP,...,DOWN,DOWN without SIB shortcut
    cousinDegree = Math.min(upCount, downCount) - 1
    const diff = Math.abs(upCount - downCount)
    removedLevel = diff > 0 ? diff : null
  }

  return { side, type, generationDelta, cousinDegree, removedLevel, hopCount: edges.length }
}

function computeConfidence(edges: PathEdge[], canonicalLabel: string): number {
  const steps = edges.length
  if (steps === 0) return 1.0
  if (steps <= 1) return 0.99
  if (steps <= 2) return 0.97
  if (steps <= 4) return 0.93
  if (steps <= 6) return 0.85
  if (!canonicalLabel.endsWith('-step relative')) return 0.72
  return 0.55
}

/**
 * Compute a full semantic relationship between two family members.
 *
 * @param fromId   Source member id
 * @param toId     Target member id
 * @param members  Full member roster
 * @param fromLabel Label used for the source in the chain sentence ("your", "Rahul's", etc.)
 */
export function computeSemanticRelationship(
  fromId: string,
  toId: string,
  members: FamilyMember[],
  fromLabel = 'your',
  selfId?: string | null,
): SemanticRelationship {
  // Enrich with label-derived virtual edges so isolated members become reachable
  const enriched = enrichMembersWithDerivedEdges(members, selfId)
  const enrichedMap = new Map(enriched.map(m => [m.id, m]))
  const NOT_FOUND: SemanticRelationship = {
    found: false,
    canonicalLabel: 'Not connected',
    chain: [],
    semanticChain: [],
    chainSentence: 'These two people are not connected in the family tree.',
    pathWithLabels: [],
    metadata: { side: null, type: 'blood', generationDelta: 0, cousinDegree: null, removedLevel: null, hopCount: 0 },
    confidence: 0,
  }

  if (fromId === toId) {
    const self = members.find(m => m.id === fromId)
    return {
      found: true, canonicalLabel: 'Self', chain: [], semanticChain: [],
      chainSentence: 'Same person',
      pathWithLabels: self ? [{ member: self, stepLabel: 'You', edgeType: 'START' }] : [],
      metadata: { side: null, type: 'blood', generationDelta: 0, cousinDegree: null, removedLevel: null, hopCount: 0 },
      confidence: 1,
    }
  }

  const memberMap = new Map(members.map(m => [m.id, m]))
  const fromMember = memberMap.get(fromId)
  const toMember = memberMap.get(toId)
  if (!fromMember || !toMember) return NOT_FOUND

  const edges = findEdgePath(fromId, toId, enriched)
  if (!edges || edges.length === 0) return NOT_FOUND

  // Build raw path using enrichedMap (includes virtual nodes for label computation)
  const rawPath: FamilyMember[] = [fromMember]
  for (const edge of edges) {
    const m = enrichedMap.get(edge.memberId)
    if (m) rawPath.push(m)
  }

  // Annotated path — skip virtual nodes (they are structural anchors, not real people)
  const pathWithLabels: RelationPathNode[] = [
    { member: fromMember, stepLabel: fromLabel === 'your' ? 'You' : fromMember.name.split(' ')[0], edgeType: 'START' },
  ]
  for (let i = 0; i < edges.length; i++) {
    const target = enrichedMap.get(edges[i].memberId)
    if (!target || target.id.startsWith('__virt_')) continue
    pathWithLabels.push({ member: target, stepLabel: edgeStepLabel(edges[i].edge, target), edgeType: edges[i].edge })
  }

  // Raw chain — step labels for real nodes only
  const chain = edges
    .map(e => { const t = enrichedMap.get(e.memberId); return (!t || t.id.startsWith('__virt_')) ? null : edgeStepLabel(e.edge, t) })
    .filter((s): s is string => s !== null)

  // Semantic (compressed) chain — removes MRCA pivot for natural language
  const semanticChain = buildSemanticChain(rawPath, edges, enriched)

  // Canonical relationship label
  const canonicalLabel = computeRelationLabel(fromId, toId, enriched) ?? `${edges.length}-step relative`

  // Chain sentence using compressed chain
  const chainLower = semanticChain.map(s => s.toLowerCase())
  const chainSentence =
    chainLower.length === 0
      ? 'Same person'
      : `${toMember.name} is ${fromLabel} ${chainLower.join("'s ")}`

  // Metadata
  const metadata = buildRelationMetadata(edges, fromMember, toMember)

  // Patch side from canonical label (more reliable than edge geometry alone)
  const cl = canonicalLabel.toLowerCase()
  if (cl.includes('paternal')) metadata.side = 'paternal'
  else if (cl.includes('maternal')) metadata.side = 'maternal'
  else if (cl.includes('in-law') || cl.includes('saala') || cl.includes('saali') || cl.includes('devar')) metadata.side = 'spouse'
  else if (metadata.side === null && chain[0] === 'Father') metadata.side = 'paternal'
  else if (metadata.side === null && chain[0] === 'Mother') metadata.side = 'maternal'

  return {
    found: true,
    canonicalLabel,
    chain,
    semanticChain,
    chainSentence,
    pathWithLabels,
    metadata,
    confidence: computeConfidence(edges, canonicalLabel),
  }
}

/**
 * Returns the number of relationship hops between two members,
 * or null if no connection exists in the graph.
 * 0 = same person, 1 = direct (parent/child/spouse), 2 = grandparent/sibling, etc.
 */
export function computeDegreesOfSeparation(
  fromId: string,
  toId: string,
  members: FamilyMember[],
): number | null {
  if (fromId === toId) return 0
  const edges = findEdgePath(fromId, toId, members)
  if (edges === null) return null
  return edges.length
}
