// lib/graph-merge.ts
// Shared graph-edge merge helpers used when combining two family_members nodes
// (admin duplicate merge in /api/members/[id]/merge, and the cross-family self-node
// migration in /api/nodes/[id]/claim). Centralising these prevents the two routes
// from drifting.

/**
 * Union two member-id arrays (parent_ids / spouse_ids), removing duplicates and
 * any ids listed in `exclude` (typically the two nodes being merged, to avoid
 * self-referential edges).
 */
export function unionMemberIds(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
  exclude: string[] = [],
): string[] {
  const ex = new Set(exclude)
  return [...new Set([...(a ?? []), ...(b ?? [])])].filter((id) => !ex.has(id))
}

/**
 * Remap every occurrence of `fromId` to `toId` in a member-id array.
 * Deduplicates after remapping: if the array already contained `toId`,
 * remapping `fromId → toId` would produce a duplicate edge, which would
 * violate the DB uniqueness constraint in migration 043.
 */
export function remapMemberIds(
  ids: string[] | null | undefined,
  fromId: string,
  toId: string,
): string[] {
  return [...new Set((ids ?? []).map((id) => (id === fromId ? toId : id)))]
}
