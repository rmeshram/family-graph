-- Migration 028: Add DB-level constraint — birth_year cannot be in the future
-- ============================================================================
-- Application code already rejects future birth years at the API layer, but
-- there is no DB constraint preventing direct inserts (e.g. via the Supabase
-- client in hooks, or through the Supabase Studio UI).
--
-- This migration adds a CHECK constraint so the database enforces the rule
-- regardless of how the row is written.
-- ============================================================================

ALTER TABLE public.family_members
  DROP CONSTRAINT IF EXISTS family_members_birth_year_range_check;

ALTER TABLE public.family_members
  ADD CONSTRAINT family_members_birth_year_range_check
    CHECK (
      birth_year IS NULL
      OR (birth_year >= 1800 AND birth_year <= EXTRACT(YEAR FROM NOW())::INTEGER)
    );
