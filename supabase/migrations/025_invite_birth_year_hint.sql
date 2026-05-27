-- Migration 025: Optional DOB hint for node_claim invites
-- Stores the inviter-provided birth year used for extra verification.

ALTER TABLE public.invite_links
  ADD COLUMN IF NOT EXISTS birth_year_hint INTEGER;

ALTER TABLE public.invite_links
  DROP CONSTRAINT IF EXISTS invite_links_birth_year_hint_check;

ALTER TABLE public.invite_links
  ADD CONSTRAINT invite_links_birth_year_hint_check
  CHECK (
    birth_year_hint IS NULL
    OR (birth_year_hint >= 1800 AND birth_year_hint <= 2200)
  );
