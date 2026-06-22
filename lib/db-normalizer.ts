/**
 * DB Normalization Persistence Bridge
 *
 * Connects the in-memory normalization pipeline to Supabase.
 *
 * The pipeline (lib/graph-layout-engine.ts + lib/family-relationship-normalizer.ts
 * + lib/person-identity-resolver.ts) runs entirely in memory and is only invoked
 * from CLI scripts against sample data. This module is the missing piece:
 * it fetches live DB rows, runs the pipeline, diffs before/after, and persists
 * the changes back to Supabase using the service-role admin client.
 *
 * ─── Data path ────────────────────────────────────────────────────────────────
 *
 *   [Supabase family_members table]
 *       ↓ fetchFamilyRows(adminClient, familyId)
 *   raw DB rows (snake_case)
 *       ↓ rowToMember()
 *   FamilyMember[] — beforeMembers
 *       ↓ normalizeFamilyRelationships()   Phase 1
 *   RelationshipNormResult
 *       ↓ resolvePersonIdentities()        Phase 2
 *   IdentityResolutionResult — afterMembers
 *       ↓ diffMembers(before, after, identities)
 *   NormalizationPlan (merges + fieldFixes + humanReviewQueue)
 *       ↓ executeNormalizationPlan()       [if dryRun=false]
 *   DB mutations:
 *     - rewrite_member_refs RPC  (batch array replace)
 *     - UPDATE family_members    (canonical patch + soft-delete)
 *     - INSERT normalization_audit_log
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FamilyMember } from './types'
import { normalizeFamilyRelationships, type NormFix } from './family-relationship-normalizer'
import { resolvePersonIdentities, type PotentialDuplicate } from './person-identity-resolver'

// ─── Types ────────────────────────────────────────────────────────────────────

/** One identity merge: duplicate will be soft-deleted, canonical gets its data. */
export interface MergePlan {
  canonicalId: string
  canonicalName: string
  duplicateId: string
  duplicateName: string
  confidence: number
  matchReasons: string[]
  /** Scalar fields to set on the canonical node (only fields where duplicate had data canonical lacked). */
  canonicalPatch: Record<string, unknown>
  /** Number of OTHER nodes that reference duplicateId in parent_ids / spouse_ids. */
  refRewriteCount: number
  /** Complete DB row of the duplicate before deletion — stored for rollback. */
  duplicateSnapshot: Record<string, unknown>
}

/** A single array-or-scalar field correction from Phase 1. */
export interface FieldFix {
  memberId: string
  memberName: string
  field: 'parent_ids' | 'spouse_ids' | 'generation'
  oldValue: unknown
  newValue: unknown
  reason: string
}

export interface NormalizationPlan {
  familyId: string
  /** Phase 2 identity merges — each removes a duplicate node. */
  merges: MergePlan[]
  /** Phase 1 field-level fixes: dangling refs, one-way spouses, generation corrections. */
  fieldFixes: FieldFix[]
  /** Pairs the engine found but is NOT confident enough to auto-merge (needs human review). */
  humanReviewQueue: PotentialDuplicate[]
  summary: {
    totalMembers: number
    autoMerges: number
    fieldFixes: number
    humanReview: number
  }
}

export interface NormalizationResult {
  plan: NormalizationPlan
  beforeSnapshot: MemberSnapshot[]
  afterSnapshot: MemberSnapshot[]
  executed: boolean
  mutations?: {
    mergesApplied: number
    refRewrites: number
    fieldFixesApplied: number
    softDeleted: number
  }
}

/** Compact graph snapshot for before/after display. */
export interface MemberSnapshot {
  id: string
  name: string
  generation: number
  parentIds: string[]
  spouseIds: string[]
  status: 'active' | 'merged_away'
  mergedInto?: string
}

// ─── DB row → FamilyMember (server-side mirror of hooks/use-members.ts:dbToMember) ──

function rowToMember(row: Record<string, unknown>): FamilyMember {
  return {
    id: row.id as string,
    name: row.name as string,
    birthYear: (row.birth_year as number | null) ?? undefined,
    birthMonth: (row.birth_month as number | null) ?? undefined,
    birthDay: (row.birth_day as number | null) ?? undefined,
    deathYear: (row.death_year as number | null) ?? undefined,
    birthPlace: (row.birth_place as string | null) ?? undefined,
    currentPlace: (row.current_place as string | null) ?? undefined,
    photoUrl: (row.photo_url as string | null) ?? undefined,
    bio: (row.bio as string | null) ?? undefined,
    relationship: (row.relationship as FamilyMember['relationship'] | null) ?? undefined,
    occupation: (row.occupation as string | null) ?? undefined,
    parentIds: ((row.parent_ids as string[] | null) ?? []),
    spouseIds: ((row.spouse_ids as string[] | null) ?? []),
    generation: row.generation as number,
    isAlive: (row.is_alive as boolean) ?? true,
    gender: (row.gender as FamilyMember['gender'] | null) ?? undefined,
    tags: ((row.tags as string[] | null) ?? []) as FamilyMember['tags'],
    side: (row.side as FamilyMember['side'] | null) ?? undefined,
    role: (row.role as FamilyMember['role'] | null) ?? undefined,
    gotra: (row.gotra as string | null) ?? undefined,
    caste: (row.caste as string | null) ?? undefined,
    hometown: (row.hometown as string | null) ?? undefined,
    nativeLanguage: (row.native_language as string | null) ?? undefined,
    religion: (row.religion as string | null) ?? undefined,
    phone: (row.phone as string | null) ?? undefined,
    email: (row.email as string | null) ?? undefined,
    instagramHandle: (row.instagram_handle as string | null) ?? undefined,
    addedAt: row.added_at as string,
    claimedByUserId: (row.claimed_by_user_id as string | null) ?? undefined,
    isClaimed: (row.is_claimed as boolean) ?? false,
    visibility: ((row.visibility as FamilyMember['visibility'] | null) ?? 'family'),
    claimStatus: ((row.claim_status as FamilyMember['claimStatus'] | null) ?? 'unclaimed'),
    claimedAt: (row.claimed_at as string | null) ?? undefined,
    isDeceased: (row.is_deceased as boolean) ?? false,
    showAsAnonymous: (row.show_as_anonymous as boolean) ?? false,
    isBiodataVisible: (row.is_biodata_visible as boolean) ?? false,
    networkGroup: ((row.network_group as FamilyMember['networkGroup'] | null) ?? 'core'),
    affiliatedFamilyId: (row.affiliated_family_id as string | null) ?? undefined,
    affiliatedFamilyName: (row.affiliated_family_name as string | null) ?? undefined,
    affiliatedJunctionId: (row.affiliated_junction_id as string | null) ?? undefined,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortedArrayEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const as = [...a].sort()
  const bs = [...b].sort()
  return as.every((v, i) => v === bs[i])
}

/** Fields that the identity resolver may copy from duplicate → canonical. */
const MERGEABLE_FIELDS = [
  ['birthYear', 'birth_year'],
  ['birthPlace', 'birth_place'],
  ['occupation', 'occupation'],
  ['bio', 'bio'],
  ['gender', 'gender'],
  ['gotra', 'gotra'],
  ['phone', 'phone'],
  ['photoUrl', 'photo_url'],
] as const

// ─── Phase: fetch raw rows ─────────────────────────────────────────────────────

export async function fetchFamilyRows(
  admin: SupabaseClient,
  familyId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await admin
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .order('generation', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw new Error(`fetchFamilyRows: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

// ─── Phase: plan normalization (no DB writes) ──────────────────────────────────

export function planNormalization(
  rawRows: Record<string, unknown>[],
  familyId: string,
): NormalizationPlan {
  const beforeMembers = rawRows.map(rowToMember)
  const byId = new Map<string, Record<string, unknown>>(rawRows.map(r => [r.id as string, r]))

  // ── Phase 1: relationship normalization ───────────────────────────────────────
  const p1 = normalizeFamilyRelationships(beforeMembers)

  // ── Phase 2: identity resolution ──────────────────────────────────────────────
  const p2 = resolvePersonIdentities(p1.members)

  const afterById = new Map<string, FamilyMember>(p2.members.map(m => [m.id, m]))
  const beforeById = new Map<string, FamilyMember>(beforeMembers.map(m => [m.id, m]))

  // ── Compute merge plans ───────────────────────────────────────────────────────
  const merges: MergePlan[] = []

  for (const ri of p2.resolvedIdentities) {
    for (const mergedFromId of ri.mergedFromIds) {
      const canonicalBefore = beforeById.get(ri.canonicalId)!
      const canonicalAfter = afterById.get(ri.canonicalId)!
      const duplicateBefore = beforeById.get(mergedFromId)!
      const duplicateRow = byId.get(mergedFromId) ?? {}

      // Compute which scalar fields are being transferred from duplicate → canonical
      const canonicalPatch: Record<string, unknown> = {}
      const fieldUpdates: Record<string, { from: unknown; to: unknown }> = {}

      for (const [jsField, dbField] of MERGEABLE_FIELDS) {
        const beforeVal = (canonicalBefore as unknown as Record<string, unknown>)[jsField]
        const afterVal = (canonicalAfter as unknown as Record<string, unknown>)[jsField]
        if ((beforeVal === undefined || beforeVal === null) && afterVal != null) {
          canonicalPatch[dbField] = afterVal
          fieldUpdates[dbField] = { from: beforeVal ?? null, to: afterVal }
        }
      }

      // Array fields (always include if they changed)
      if (!sortedArrayEqual(canonicalBefore.parentIds, canonicalAfter.parentIds)) {
        canonicalPatch.parent_ids = canonicalAfter.parentIds
        fieldUpdates.parent_ids = {
          from: canonicalBefore.parentIds,
          to: canonicalAfter.parentIds,
        }
      }
      if (!sortedArrayEqual(canonicalBefore.spouseIds, canonicalAfter.spouseIds)) {
        canonicalPatch.spouse_ids = canonicalAfter.spouseIds
        fieldUpdates.spouse_ids = {
          from: canonicalBefore.spouseIds,
          to: canonicalAfter.spouseIds,
        }
      }

      // Count OTHER members whose refs need rewriting (the batch SQL function handles this)
      const refRewriteCount = beforeMembers.filter(m =>
        m.id !== mergedFromId &&
        m.id !== ri.canonicalId &&
        (m.parentIds.includes(mergedFromId) || m.spouseIds.includes(mergedFromId))
      ).length

      merges.push({
        canonicalId: ri.canonicalId,
        canonicalName: ri.canonicalName,
        duplicateId: mergedFromId,
        duplicateName: duplicateBefore.name,
        confidence: ri.confidence,
        matchReasons: ri.matchReasons,
        canonicalPatch,
        refRewriteCount,
        duplicateSnapshot: { ...duplicateRow, _field_updates: fieldUpdates },
      })
    }
  }

  // ── Compute field fixes (Phase 1 array/scalar corrections) ────────────────────
  // We diff before/after for every surviving member (not merged-away).
  const fieldFixes: FieldFix[] = []
  const mergedAwayIds = new Set(merges.map(m => m.duplicateId))

  for (const before of beforeMembers) {
    if (mergedAwayIds.has(before.id)) continue

    const after = afterById.get(before.id)
    if (!after) continue

    // parent_ids changed
    if (!sortedArrayEqual(before.parentIds, after.parentIds)) {
      fieldFixes.push({
        memberId: before.id,
        memberName: before.name,
        field: 'parent_ids',
        oldValue: before.parentIds,
        newValue: after.parentIds,
        reason: buildFixReason('parent_ids', before.parentIds, after.parentIds, beforeById),
      })
    }

    // spouse_ids changed
    if (!sortedArrayEqual(before.spouseIds, after.spouseIds)) {
      fieldFixes.push({
        memberId: before.id,
        memberName: before.name,
        field: 'spouse_ids',
        oldValue: before.spouseIds,
        newValue: after.spouseIds,
        reason: buildFixReason('spouse_ids', before.spouseIds, after.spouseIds, beforeById),
      })
    }

    // generation changed
    if (before.generation !== after.generation) {
      fieldFixes.push({
        memberId: before.id,
        memberName: before.name,
        field: 'generation',
        oldValue: before.generation,
        newValue: after.generation,
        reason: `generation recomputed from BFS: ${before.generation} → ${after.generation}`,
      })
    }
  }

  const humanReviewQueue = p2.potentialDuplicates.filter(pd => !pd.autoMerged)

  return {
    familyId,
    merges,
    fieldFixes,
    humanReviewQueue,
    summary: {
      totalMembers: beforeMembers.length,
      autoMerges: merges.length,
      fieldFixes: fieldFixes.length,
      humanReview: humanReviewQueue.length,
    },
  }
}

function buildFixReason(
  field: string,
  before: string[],
  after: string[],
  byId: Map<string, FamilyMember>,
): string {
  const removed = before.filter(id => !after.includes(id))
  const added = after.filter(id => !before.includes(id))
  const parts: string[] = []
  if (removed.length > 0) {
    const names = removed.map(id => byId.get(id)?.name ?? id)
    parts.push(`removed dangling/duplicate refs: ${names.join(', ')}`)
  }
  if (added.length > 0) {
    const names = added.map(id => byId.get(id)?.name ?? id)
    parts.push(`added missing back-reference: ${names.join(', ')}`)
  }
  return parts.join('; ') || `${field} normalised`
}

// ─── Phase: execute plan (writes to DB) ──────────────────────────────────────

export async function executeNormalizationPlan(
  admin: SupabaseClient,
  plan: NormalizationPlan,
  actorId: string,
): Promise<{
  mergesApplied: number
  refRewrites: number
  fieldFixesApplied: number
  softDeleted: number
}> {
  const now = new Date().toISOString()
  let mergesApplied = 0
  let totalRefRewrites = 0
  let fieldFixesApplied = 0
  let softDeleted = 0

  // ── Step 1: identity merges ───────────────────────────────────────────────────
  for (const merge of plan.merges) {
    const {
      canonicalId,
      canonicalName,
      duplicateId,
      duplicateName,
      confidence,
      matchReasons,
      canonicalPatch,
      duplicateSnapshot,
    } = merge

    // 1a. Update canonical node with merged scalar + array fields
    if (Object.keys(canonicalPatch).length > 0) {
      const { error: patchErr } = await (admin as any)
        .from('family_members')
        .update({ ...canonicalPatch, updated_at: now })
        .eq('id', canonicalId)
        .is('deleted_at', null)

      if (patchErr) {
        console.error(`[db-normalizer] canonical patch failed for ${canonicalId}:`, patchErr.message)
        continue
      }
    }

    // 1b. Rewrite all other nodes' parent_ids / spouse_ids via batch SQL function
    const { data: rewriteCount, error: rewriteErr } = await (admin as any).rpc(
      'rewrite_member_refs',
      {
        p_family_id: plan.familyId,
        p_duplicate_id: duplicateId,
        p_canonical_id: canonicalId,
      },
    )

    if (rewriteErr) {
      console.error(`[db-normalizer] rewrite_member_refs failed:`, rewriteErr.message)
    } else {
      totalRefRewrites += (rewriteCount as number) ?? 0
    }

    // 1c. Soft-delete the duplicate node
    const { error: deleteErr } = await (admin as any)
      .from('family_members')
      .update({
        deleted_at: now,
        deleted_by: actorId,
        updated_at: now,
      })
      .eq('id', duplicateId)
      .is('deleted_at', null)

    if (deleteErr) {
      console.error(`[db-normalizer] soft-delete failed for ${duplicateId}:`, deleteErr.message)
      continue
    }
    softDeleted++

    // 1d. Write audit log
    const fieldUpdates = (duplicateSnapshot as any)._field_updates ?? {}
    await (admin as any).from('normalization_audit_log').insert({
      family_id: plan.familyId,
      canonical_id: canonicalId,
      merged_from_id: duplicateId,
      canonical_name: canonicalName,
      merged_from_name: duplicateName,
      confidence,
      match_reasons: matchReasons,
      merged_by: actorId,
      merged_at: now,
      field_updates: fieldUpdates,
      ref_rewrites: (rewriteCount as number) ?? 0,
      duplicate_snapshot: duplicateSnapshot,
    })

    mergesApplied++
  }

  // ── Step 2: field-level fixes (Phase 1) ───────────────────────────────────────
  for (const fix of plan.fieldFixes) {
    const { memberId, field, newValue } = fix

    if (field === 'generation') {
      const { error } = await (admin as any)
        .from('family_members')
        .update({ generation: newValue as number, updated_at: now })
        .eq('id', memberId)
        .is('deleted_at', null)

      if (error) {
        console.error(`[db-normalizer] generation fix failed for ${memberId}:`, error.message)
      } else {
        fieldFixesApplied++
      }
    } else {
      // parent_ids or spouse_ids — use the SQL helper for safety
      const { error } = await (admin as any).rpc('normalize_field_fix', {
        p_member_id: memberId,
        p_field: field,
        p_new_value: newValue as string[],
      })

      if (error) {
        console.error(`[db-normalizer] field fix failed for ${memberId}.${field}:`, error.message)
      } else {
        fieldFixesApplied++
      }
    }
  }

  return { mergesApplied, refRewrites: totalRefRewrites, fieldFixesApplied, softDeleted }
}

// ─── Build before/after snapshots for display ────────────────────────────────

export function buildSnapshots(
  rawRows: Record<string, unknown>[],
  plan: NormalizationPlan,
): { before: MemberSnapshot[]; after: MemberSnapshot[] } {
  const mergedAwayIds = new Set(plan.merges.map(m => m.duplicateId))
  const mergeDestination = new Map(plan.merges.map(m => [m.duplicateId, m.canonicalId]))

  // Field-fix lookup: memberId → { field → newValue }
  const fixMap = new Map<string, Record<string, unknown>>()
  for (const fix of plan.fieldFixes) {
    if (!fixMap.has(fix.memberId)) fixMap.set(fix.memberId, {})
    fixMap.get(fix.memberId)![fix.field] = fix.newValue
  }

  // Merge patch lookup: canonicalId → canonicalPatch
  const mergePatches = new Map(plan.merges.map(m => [m.canonicalId, m.canonicalPatch]))

  const before: MemberSnapshot[] = rawRows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    generation: row.generation as number,
    parentIds: (row.parent_ids as string[] | null) ?? [],
    spouseIds: (row.spouse_ids as string[] | null) ?? [],
    status: mergedAwayIds.has(row.id as string) ? 'merged_away' : 'active',
    mergedInto: mergeDestination.get(row.id as string),
  }))

  const after: MemberSnapshot[] = rawRows
    .filter(row => !mergedAwayIds.has(row.id as string))
    .map(row => {
      const id = row.id as string
      const fixes = fixMap.get(id) ?? {}
      const patch = mergePatches.get(id) ?? {}

      const resolvedParentIds =
        (patch.parent_ids as string[] | undefined) ??
        (fixes.parent_ids as string[] | undefined) ??
        ((row.parent_ids as string[] | null) ?? [])

      const resolvedSpouseIds =
        (patch.spouse_ids as string[] | undefined) ??
        (fixes.spouse_ids as string[] | undefined) ??
        ((row.spouse_ids as string[] | null) ?? [])

      // Filter out any refs to merged-away IDs (replaced by canonical)
      const canonicalOf = new Map(plan.merges.map(m => [m.duplicateId, m.canonicalId]))
      const cleanParents = [...new Set(resolvedParentIds.map(pid => canonicalOf.get(pid) ?? pid))]
        .filter(pid => !mergedAwayIds.has(pid))
      const cleanSpouses = [...new Set(resolvedSpouseIds.map(sid => canonicalOf.get(sid) ?? sid))]
        .filter(sid => !mergedAwayIds.has(sid))

      return {
        id,
        name: row.name as string,
        generation: (fixes.generation as number | undefined) ?? (row.generation as number),
        parentIds: cleanParents,
        spouseIds: cleanSpouses,
        status: 'active' as const,
      }
    })

  return { before, after }
}
