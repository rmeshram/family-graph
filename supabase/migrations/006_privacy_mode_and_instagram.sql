-- Migration 006: families.privacy_mode + family_members.instagram_handle
-- Run this in Supabase SQL Editor.

-- ── Family privacy mode ───────────────────────────────────────────────────────
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS privacy_mode TEXT
    CHECK (privacy_mode IN ('open', 'protected', 'closed'))
    DEFAULT 'protected';

COMMENT ON COLUMN families.privacy_mode IS
  'open = anyone can view & join; protected = members only, approval required; closed = invite-only, public bio-link shows nothing';

-- ── Instagram handle on members ───────────────────────────────────────────────
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT;

COMMENT ON COLUMN family_members.instagram_handle IS
  'Instagram username without @ prefix, e.g. "rahulgupta"';

-- ── Backfill existing families to protected (already the default, but explicit) ─
UPDATE families SET privacy_mode = 'protected' WHERE privacy_mode IS NULL;
