-- Migration 003: Extended & Affiliated Family Network
-- Adds support for three tiers of family members:
--   core       — direct blood relatives (default, backward compatible)
--   extended   — distant blood relatives (2nd cousins, great-uncles/aunts, etc.)
--   affiliated — unrelated-by-blood families connected via marriage (brother's wife's family, in-laws' relatives)

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS network_group TEXT NOT NULL DEFAULT 'core'
    CHECK (network_group IN ('core', 'extended', 'affiliated')),
  ADD COLUMN IF NOT EXISTS affiliated_family_id TEXT,          -- shared key for all members of same external cluster
  ADD COLUMN IF NOT EXISTS affiliated_family_name TEXT,        -- display name e.g. "Rao Family"
  ADD COLUMN IF NOT EXISTS affiliated_junction_id UUID REFERENCES family_members(id) ON DELETE SET NULL;

-- Index for efficient cluster lookups
CREATE INDEX IF NOT EXISTS idx_family_members_network_group ON family_members(network_group);
CREATE INDEX IF NOT EXISTS idx_family_members_affiliated_family ON family_members(affiliated_family_id) WHERE affiliated_family_id IS NOT NULL;

-- Update RLS: extended and affiliated members follow the same visibility rules as core members
-- (no changes needed — existing policies use family_id which is unchanged)

COMMENT ON COLUMN family_members.network_group IS 'core=direct blood relative, extended=distant blood relative, affiliated=connected via marriage (in-laws family)';
COMMENT ON COLUMN family_members.affiliated_family_id IS 'Shared identifier for all members of the same affiliated (in-law) family cluster';
COMMENT ON COLUMN family_members.affiliated_family_name IS 'Display name for the affiliated family e.g. Rao Family, Kapoor Family';
COMMENT ON COLUMN family_members.affiliated_junction_id IS 'The core-tree member through whom this affiliated family connects (usually a spouse)';
