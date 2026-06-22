/**
 * Family Relationship Normalizer — Phase 1 of the Graph Integrity Pipeline
 *
 * Responsibilities:
 *   1. Remove duplicate IDs in parent_ids and spouse_ids
 *   2. Make spouse relationships bidirectional
 *   3. Remove self-parent and self-spouse references
 *   4. Detect and flag impossible relationships (without silently fixing them):
 *      - person is their own ancestor (circular)
 *      - spouse is also listed as a parent
 *      - child is also listed as a spouse
 *      - sibling listed as parent
 *   5. Recompute generation values from raw parent-child links
 *      (stored generation values are IGNORED and always recomputed)
 *   6. Remove dangling references to non-existent IDs
 *
 * This module is the clean public API. It delegates to normalization-engine.ts
 * internally and re-shapes the result into strict errors / warnings buckets.
 */

import { FamilyMember } from './types'
import { normalizeFamilyTree, NormIssue, NormFix } from './normalization-engine'

// ── Re-export shared types so callers don't need to import normalization-engine ─

export type { NormIssue, NormFix }

// ── Public result shape ───────────────────────────────────────────────────────

export interface RelationshipNormResult {
  /** Deep-cloned members with all safe auto-fixes applied. */
  members: FamilyMember[]
  /**
   * Hard errors: self-parent, self-spouse, circular refs, sibling-as-parent,
   * spouse-as-parent, dangling refs, duplicate member IDs, conflicting parentage.
   * These are flagged but NOT silently fixed; the caller decides.
   */
  errors: NormIssue[]
  /**
   * Soft warnings: generation mismatches, duplicate identity candidates,
   * marital-status contradictions, name collisions.
   */
  warnings: NormIssue[]
  /** Every safe fix that was automatically applied. */
  fixes: NormFix[]
  /** Info-level notices (e.g. confirmed non-duplicate name collisions). */
  info: NormIssue[]
}

// ── Main function ─────────────────────────────────────────────────────────────

export function normalizeFamilyRelationships(members: FamilyMember[]): RelationshipNormResult {
  const result = normalizeFamilyTree(members)

  return {
    members: result.cleaned_members,
    errors: result.issues_found.filter(i => i.severity === 'error'),
    warnings: result.issues_found.filter(i => i.severity === 'warning'),
    info: result.issues_found.filter(i => i.severity === 'info'),
    fixes: result.fixes_applied,
  }
}

// ── Summary helpers (used by validation report) ───────────────────────────────

export function summariseFixes(fixes: NormFix[]): Map<string, NormFix[]> {
  const byType = new Map<string, NormFix[]>()
  for (const f of fixes) {
    const key = f.issue.split(' ')[0] // take the first word as the type key
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key)!.push(f)
  }
  return byType
}
