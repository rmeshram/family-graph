/**
 * Relationship Intelligence Engine — MVP
 *
 * Deterministic, rule-based inference layered on top of the existing
 * `lib/relation-engine.ts` path/label engine.
 *
 * What this engine does:
 *  1. Inverse relationship mapping — gender-aware
 *  2. Co-parent spouse suggestions — if A and B share a child but aren't
 *     yet spouses, surface a confirmation prompt
 *  3. Sibling label suggestions — when two members share the same parents,
 *     offer to explicitly label them as siblings (helpful for display)
 *  4. Post-add consistency check — run immediately after a member is added
 *  5. Graph consistency validation — detect contradictions
 *
 * What this engine does NOT do:
 *  - Probabilistic / AI inference
 *  - Auto-apply anything without user confirmation
 *  - Replace the existing BFS label engine in lib/relation-engine.ts
 *
 * The existing `addMember` in hooks/use-members.ts already handles
 * bidirectional spouse_ids updates automatically. This engine handles
 * the higher-level "suggestions" that need user confirmation.
 */

import type { FamilyMember } from './types'

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

export type RelationshipSuggestionKind = 'sibling' | 'spouse' | 'in-law'

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

// ─── Main post-add entry point ─────────────────────────────────────────────

/**
 * Call this immediately after a new member is added.
 * Pass in the full updated member list (including the new member).
 * Returns suggestions to show the user, ordered by confidence.
 */
export function computePostAddSuggestions(
  newMemberId: string,
  allMembers: FamilyMember[],
): RelationshipSuggestion[] {
  const suggestions: RelationshipSuggestion[] = [
    ...inferCoParentSpouseSuggestions(allMembers, newMemberId),
    ...inferSiblingLabelSuggestions(allMembers, newMemberId),
  ]
  // High-confidence first, then medium
  return suggestions.sort((a, b) =>
    (a.confidence === 'high' ? 0 : 1) - (b.confidence === 'high' ? 0 : 1)
  )
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
  }

  return warnings
}
