-- Migration 047: matrimony biodata-visibility eligibility guard
--
-- WHY: The matches feed (app/(app)/matches/page.tsx) is a client-side query that
-- simply filters `family_members` on `is_biodata_visible = true`. Nothing on the
-- server prevents a node from being flagged visible, so a minor or a photoless
-- profile could appear in matrimony discovery. SPEC reserves error
-- `UNDERAGE_BIODATA` (422) for this but nothing enforced it. docs/tasks.md audit
-- §13 flags it as a CRITICAL gap (child protection + trust). This trigger is the
-- server-side safety net — defense-in-depth behind the UI rules.
--
-- BEHAVIOUR (only evaluated when a row is being made/kept biodata-visible):
--   * Age < 18 or unverifiable age (birth_year IS NULL) → HARD BLOCK (raises
--     UNDERAGE_BIODATA). A child must never be discoverable for matrimony.
--   * No photo (both photo_url and biodata_photo_url empty) → soft coerce
--     is_biodata_visible back to FALSE. A photoless profile simply stays hidden
--     until a photo is added (audit must-do #2) without erroring the caller.
--
-- The upper age bound (the 18–45 discovery preference) is intentionally NOT a
-- hard DB cap — it is a search/filter concern and a hard cap would wrongly block
-- legitimate remarriage cases. Lower bound + photo are the safety/quality gates.

CREATE OR REPLACE FUNCTION enforce_biodata_visibility_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  age_years   integer;
  has_photo   boolean;
BEGIN
  -- Nothing to enforce unless the node is (becoming) visible for matrimony.
  IF NEW.is_biodata_visible IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Age gate (child protection) — hard block.
  IF NEW.birth_year IS NULL THEN
    RAISE EXCEPTION 'UNDERAGE_BIODATA: biodata visibility requires a verified birth year'
      USING ERRCODE = 'check_violation';
  END IF;

  age_years := EXTRACT(YEAR FROM now())::int - NEW.birth_year;
  IF age_years < 18 THEN
    RAISE EXCEPTION 'UNDERAGE_BIODATA: biodata visibility requires an age of 18 or older (got %)', age_years
      USING ERRCODE = 'check_violation';
  END IF;

  -- Photo gate (quality) — soft coerce to hidden rather than erroring.
  has_photo := COALESCE(NULLIF(btrim(NEW.photo_url), ''), NULLIF(btrim(NEW.biodata_photo_url), '')) IS NOT NULL;
  IF NOT has_photo THEN
    NEW.is_biodata_visible := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_biodata_visibility_eligibility ON family_members;

CREATE TRIGGER trg_biodata_visibility_eligibility
  BEFORE INSERT OR UPDATE OF is_biodata_visible, birth_year, photo_url, biodata_photo_url
  ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_biodata_visibility_eligibility();

-- Backfill: hide any already-visible profiles that fail the gates today.
UPDATE family_members
SET is_biodata_visible = false
WHERE is_biodata_visible = true
  AND (
    birth_year IS NULL
    OR (EXTRACT(YEAR FROM now())::int - birth_year) < 18
    OR COALESCE(NULLIF(btrim(photo_url), ''), NULLIF(btrim(biodata_photo_url), '')) IS NULL
  );
