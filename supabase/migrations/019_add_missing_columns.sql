-- Migration 019: Add columns that may be missing from older deployments
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS / DEFAULT ON CONFLICT).
-- Safe to re-run.

-- ── family_members.show_as_anonymous ─────────────────────────────────────────
-- Allows a member node to be displayed as "? Member" to non-admin viewers.
-- Originally introduced in migration 016; re-declared here for databases that
-- didn't have 016 applied.
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS show_as_anonymous boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN family_members.show_as_anonymous IS
  'When true, the member node is displayed anonymously (? Member) to non-admins.';

-- ── profiles.privacy_settings ────────────────────────────────────────────────
-- Per-user account privacy controls (originally migration 016).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS privacy_settings jsonb NOT NULL DEFAULT
    '{"hideContactInfo": false, "hideFromSearch": false, "defaultNodeVisibility": "family"}'::jsonb;

COMMENT ON COLUMN profiles.privacy_settings IS
  'Per-user privacy controls: hideContactInfo, hideFromSearch, defaultNodeVisibility';

-- ── families.created_by ───────────────────────────────────────────────────────
-- Tracks the user who created the family — used by the admin self-heal in
-- use-auth.tsx to promote the family creator to admin if the onboarding UPDATE
-- was missed.
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN families.created_by IS
  'auth.users.id of the user who created this family via onboarding';

-- Back-fill: for existing families, set created_by from the profile that has
-- role = ''admin'' for that family (best-effort, non-destructive).
UPDATE families f
SET created_by = p.id
FROM profiles p
WHERE p.family_id = f.id
  AND p.role = 'admin'
  AND f.created_by IS NULL;
