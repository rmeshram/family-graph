-- Migration 020: Matrimony / biodata visibility opt-in
-- Adds is_biodata_visible flag to family_members so profiles can be discovered
-- for community matrimony search. Off by default — must be explicitly enabled
-- by the family admin or the claimed user.

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS is_biodata_visible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN family_members.is_biodata_visible IS
  'When true, this profile is included in community-wide matrimony / biodata search results.';

-- Index for biodata search queries
CREATE INDEX IF NOT EXISTS idx_fm_biodata_visible
  ON family_members(family_id, is_biodata_visible)
  WHERE is_biodata_visible = true;

-- RLS: Only the claimer (or family admin) may toggle is_biodata_visible.
-- Contributors and viewers may not change this field.
-- We enforce this via a policy that allows UPDATE only when the caller is
-- the node owner (claimed_by_user_id = auth.uid()) or an admin.
-- The existing "members: self can update" and "members: admin update all" policies
-- already cover these rows — no new policy needed.
-- This migration is documentation-only for the above rationale.
