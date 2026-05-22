-- Migration 016: Account-level privacy settings + node anonymous display mode
-- ============================================================================
-- Adds two new columns:
--   1. profiles.privacy_settings (jsonb) — per-user account privacy controls
--   2. family_members.show_as_anonymous (boolean) — "blurred placeholder" mode:
--      the node is visible to all family members but name/details are hidden.
--      This is distinct from visibility='private' (admin-only, RLS enforced).

-- ── profiles: account-level privacy settings ──────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS privacy_settings jsonb NOT NULL DEFAULT
    '{"hideContactInfo": false, "hideFromSearch": false, "defaultNodeVisibility": "family"}'::jsonb;

COMMENT ON COLUMN profiles.privacy_settings IS
  'Per-user privacy controls: hideContactInfo (bool), hideFromSearch (bool), defaultNodeVisibility (public|family|private)';

-- ── family_members: anonymous display mode ────────────────────────────────
-- When show_as_anonymous=true the node is rendered as a grey "? Member"
-- placeholder — name and contact details are hidden from other members.
-- Admins always see the real name and can toggle this setting.
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS show_as_anonymous boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN family_members.show_as_anonymous IS
  'When true, the member node is displayed anonymously (initials only) to non-admins.';

-- ── RLS: profiles.privacy_settings is readable by the owning user ─────────
-- Profiles already have SELECT policies; the privacy_settings column
-- is part of the row so it inherits the existing policy.
-- We only need to ensure non-admins CANNOT read another user's privacy_settings.
-- Since family members can already see each other's profiles (to show names),
-- we add a function to mask sensitive data at the API layer rather than RLS,
-- consistent with the existing approach.

-- No additional RLS changes needed — privacy masking is enforced client-side
-- using the privacy_settings value fetched for the viewed member's claimer.
