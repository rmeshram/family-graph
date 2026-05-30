/**
 * lib/relation-engine.ts — Compatibility shim
 *
 * All relationship inference now delegates to lib/relationship-engine.ts,
 * the single canonical graph engine.
 *
 * This file re-exports the same public API that existing consumers import
 * so that no component-level import paths need to change.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  DO NOT add new inference logic here.                    │
 * │  All graph/BFS/label logic lives in relationship-engine  │
 * └──────────────────────────────────────────────────────────┘
 */

import type { FamilyMember } from './types'
import {
  getRelationshipBetweenPeople,
  buildRelationshipGraph,
  findPath,
  type EdgeType as EngineEdgeType,
} from './relationship-engine'

// ══════════════════════════════════════════════════════════════════════════════
// ── SECTION 1: PREPROCESSING UTILITY ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
//
// Members often have only a `relationship` label set (e.g. `relationship:'uncle'`)
// without structural graph edges (parentIds / spouseIds). This function derives
// virtual edges so BFS can traverse between ANY two people, even when exact
// intermediate nodes were never explicitly stored.
//
// Virtual nodes (prefixed __virt_) are transparent to the UI — members.find()
// returns undefined for them, so they are silently skipped in rendering.

function makeVirtMember(id: string, pIds: string[], sIds: string[]): FamilyMember {
  return { id, name: '', parentIds: pIds, spouseIds: sIds, generation: 0 } as unknown as FamilyMember
}

export function enrichMembersWithDerivedEdges(
  members: FamilyMember[],
  selfId?: string | null,
): FamilyMember[] {
  const self = selfId
    ? members.find(m => m.id === selfId)
    : members.find(m => m.relationship === 'self')
  if (!self) return members

  const sid = self.id

  const memberIdSet = new Set(members.map(m => m.id))
  const isIsolated = (m: FamilyMember): boolean => {
    // Only count parentIds/spouseIds that actually resolve to real members in this set.
    // Dangling references (deleted members, cross-family IDs) must not block enrichment.
    if (m.parentIds.some(pid => memberIdSet.has(pid))) return false
    if (m.spouseIds.some(sid => memberIdSet.has(sid))) return false
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

  const VP = `__virt_p_${sid}`
  const VGP = `__virt_gp_${sid}`
  const VS = `__virt_sib_${sid}`
  const VSP = `__virt_sp_${sid}`
  const VC = `__virt_ch_${sid}`
  const VU = `__virt_unc_${sid}`
  const VSPP = `__virt_spp_${sid}`

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
      addP(m.id, getSelfGrandparentId())
    } else if (rel === 'nephew' || rel === 'niece') {
      addP(m.id, getSelfSiblingId())
    } else if (['father-in-law', 'mother-in-law', 'parent-in-law'].includes(rel)) {
      addP(getSelfSpouseId(), m.id)
    } else if (['son-in-law', 'daughter-in-law', 'child-in-law'].includes(rel)) {
      addSp(m.id, getSelfChildId())
    } else if (['brother-in-law', 'sister-in-law', 'sibling-in-law'].includes(rel)) {
      addP(m.id, getSpouseParentId())
    } else if (['cousin', 'first-cousin', 'second-cousin'].includes(rel)) {
      addP(m.id, getSelfUncleId())
    }
    // Members with unrecognised or empty relationship labels (e.g. 'member', 'relative', 'skip')
    // are intentionally left unconnected. Forcing a virtual edge would produce an incorrect
    // sibling label for every "Other Relative" joiner. The BFS engine returns `found:false`
    // for disconnected nodes, which is correct — labels surface only once structural edges exist.
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

// ══════════════════════════════════════════════════════════════════════════════
// ── SECTION 2: COMPATIBILITY INTERFACES ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export interface RelationPathNode {
  member: FamilyMember
  stepLabel: string
  edgeType: EngineEdgeType | 'START'
}

export interface RelationMetadata {
  side: 'paternal' | 'maternal' | 'spouse' | 'mixed' | null
  type: 'blood' | 'marriage' | 'mixed'
  generationDelta: number
  cousinDegree: number | null
  removedLevel: number | null
  hopCount: number
}

export interface SemanticRelationship {
  found: boolean
  canonicalLabel: string
  chain: string[]
  semanticChain: string[]
  chainSentence: string
  pathWithLabels: RelationPathNode[]
  metadata: RelationMetadata
  confidence: number
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SECTION 3: SHIM WRAPPERS ───────────────────────────────────────────────────
// All BFS / pattern-matching removed — delegates to canonical engine.
// ══════════════════════════════════════════════════════════════════════════════

function edgeStepLabel(type: EngineEdgeType, target: FamilyMember): string {
  const m = target.gender === 'male', f = target.gender === 'female'
  if (type === 'PARENT') return m ? 'Father' : f ? 'Mother' : 'Parent'
  if (type === 'CHILD') return m ? 'Son' : f ? 'Daughter' : 'Child'
  if (type === 'SIBLING') return m ? 'Brother' : f ? 'Sister' : 'Sibling'
  return m ? 'Husband' : f ? 'Wife' : 'Spouse'
}

export function computeRelationLabel(
  fromId: string,
  toId: string,
  members: FamilyMember[],
): string | null {
  if (fromId === toId) return 'Self'
  // Try multiple enrichment anchors so label-only members (added with a relationship
  // field but no structural parentIds/spouseIds) get virtual edges that connect them.
  // fromId is typically the self/logged-in user whose perspective most relationship
  // labels were recorded relative to, so try it first.
  const anchors: Array<string | undefined> = [fromId, toId, undefined]
  for (const anchor of anchors) {
    const enriched = anchor ? enrichMembersWithDerivedEdges(members, anchor) : members
    const result = getRelationshipBetweenPeople(enriched, fromId, toId)
    if (result.found) return result.relationship
  }
  return null
}

export function findRelationshipPath(
  fromId: string,
  toId: string,
  members: FamilyMember[],
): FamilyMember[] | null {
  if (fromId === toId) return []
  const enriched = enrichMembersWithDerivedEdges(members)
  const graph = buildRelationshipGraph(enriched)
  const path = findPath(graph, fromId, toId)
  if (!path) return null
  const map = new Map(enriched.map(m => [m.id, m]))
  return path.peoplePath
    .map(id => map.get(id))
    .filter((m): m is FamilyMember => !!m && !m.id.startsWith('__virt_'))
}

export function computeDegreesOfSeparation(
  fromId: string,
  toId: string,
  members: FamilyMember[],
): number | null {
  if (fromId === toId) return 0
  const enriched = enrichMembersWithDerivedEdges(members)
  const result = getRelationshipBetweenPeople(enriched, fromId, toId)
  return result.found ? result.path.length : null
}

const SEMANTIC_NOT_FOUND: SemanticRelationship = {
  found: false,
  canonicalLabel: 'Not connected',
  chain: [],
  semanticChain: [],
  chainSentence: 'These two people are not connected in the family tree.',
  pathWithLabels: [],
  metadata: { side: null, type: 'blood', generationDelta: 0, cousinDegree: null, removedLevel: null, hopCount: 0 },
  confidence: 0,
}

export function computeSemanticRelationship(
  fromId: string,
  toId: string,
  members: FamilyMember[],
  fromLabel = 'your',
  selfId?: string | null,
): SemanticRelationship {
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

  const enriched = enrichMembersWithDerivedEdges(members, selfId)
  const memberMap = new Map(members.map(m => [m.id, m]))
  const enrichedMap = new Map(enriched.map(m => [m.id, m]))

  const result = getRelationshipBetweenPeople(enriched, fromId, toId, fromLabel)
  if (!result.found) return SEMANTIC_NOT_FOUND

  // Build pathWithLabels — real nodes only (skip __virt_ structural anchors)
  const pathWithLabels: RelationPathNode[] = []
  const fromMember = memberMap.get(fromId) ?? enrichedMap.get(fromId)
  if (fromMember) {
    pathWithLabels.push({
      member: fromMember,
      stepLabel: fromLabel === 'your' ? 'You' : fromMember.name.split(' ')[0],
      edgeType: 'START',
    })
  }

  for (let i = 1; i < result.people.length; i++) {
    const id = result.people[i]
    if (id.startsWith('__virt_')) continue
    const member = memberMap.get(id) ?? enrichedMap.get(id)
    if (!member) continue
    const edgeType = result.path[i - 1]
    pathWithLabels.push({ member, stepLabel: edgeStepLabel(edgeType, member), edgeType })
  }

  return {
    found: true,
    canonicalLabel: result.relationship,
    chain: result.semanticChain,
    semanticChain: result.semanticChain,
    chainSentence: result.chainSentence,
    pathWithLabels,
    metadata: result.metadata as RelationMetadata,
    confidence: result.confidence,
  }
}
