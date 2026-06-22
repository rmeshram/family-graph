-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 044: parent-spouse auto-linking and marital status integrity
--
-- 1. Add 'married' to the marital_status check constraint.
-- 2. Trigger: when a child has exactly 2 parents, auto-link those parents as
--    spouses (idempotent; bidirectionality from migration 039 handles the reverse).
-- 3. Trigger: auto-set marital_status = 'married' when a member gains a spouse
--    and their current status is 'never_married'.
-- 4. Hard constraint: block setting marital_status = 'never_married' on a member
--    who already has spouse_ids entries.
-- 5. One-shot backfill: link all existing parent-pairs as spouses.
-- 6. One-shot backfill: set marital_status = 'married' for all members with
--    non-empty spouse_ids.
-- 7. Deprecate the stored 'relationship' column via COMMENT.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Add 'married' to marital_status ────────────────────────────────────────
-- The original enum omitted 'married' entirely, making it impossible to
-- correctly represent linked spouses.
ALTER TABLE family_members
  DROP CONSTRAINT IF EXISTS family_members_marital_status_check;

ALTER TABLE family_members
  ADD CONSTRAINT family_members_marital_status_check
  CHECK (marital_status IN (
    'never_married',
    'married',
    'divorced',
    'widowed',
    'separated'
  ));


-- ── 2. Auto-link parent-pair as spouses ───────────────────────────────────────
-- Fires AFTER a child row is inserted or its parent_ids updated.
-- When exactly 2 parents are present, ensures parent[1] appears in parent[2].spouse_ids.
-- The bidirectionality trigger from migration 039 propagates parent[2] → parent[1].
-- Uses a session flag to avoid re-entry if this trigger is itself called from a
-- spouse_ids update that triggers auto_link_parents indirectly.
CREATE OR REPLACE FUNCTION auto_link_parents_as_spouses()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  p1 UUID;
  p2 UUID;
BEGIN
  IF array_length(NEW.parent_ids, 1) IS DISTINCT FROM 2 THEN RETURN NEW; END IF;
  IF current_setting('fg.parent_spouse_link', true) = '1' THEN RETURN NEW; END IF;

  p1 := NEW.parent_ids[1];
  p2 := NEW.parent_ids[2];

  PERFORM set_config('fg.parent_spouse_link', '1', true);

  -- Link p1 → p2; migration 039 trigger handles the reverse.
  UPDATE family_members
  SET    spouse_ids = array_append(COALESCE(spouse_ids, '{}'), p2)
  WHERE  id = p1
    AND  NOT (COALESCE(spouse_ids, '{}') @> ARRAY[p2])
    AND  deleted_at IS NULL;

  PERFORM set_config('fg.parent_spouse_link', '0', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_parents_as_spouses ON family_members;
CREATE TRIGGER trg_auto_link_parents_as_spouses
  AFTER INSERT OR UPDATE OF parent_ids ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION auto_link_parents_as_spouses();


-- ── 3. Auto-set marital_status = 'married' when a spouse is gained ────────────
-- BEFORE trigger so NEW.marital_status is corrected before the row is written.
-- Does NOT auto-revert when a spouse is removed — the user must update manually
-- (they could be divorced/widowed, not back to never_married).
CREATE OR REPLACE FUNCTION auto_marital_status_on_spouse()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF array_length(NEW.spouse_ids, 1) > 0
     AND COALESCE(NEW.marital_status, 'never_married') = 'never_married'
  THEN
    NEW.marital_status := 'married';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_marital_status ON family_members;
CREATE TRIGGER trg_auto_marital_status
  BEFORE UPDATE OF spouse_ids ON family_members
  FOR EACH ROW
  WHEN (OLD.spouse_ids IS DISTINCT FROM NEW.spouse_ids)
  EXECUTE FUNCTION auto_marital_status_on_spouse();

-- Same logic for INSERT with pre-populated spouse_ids.
DROP TRIGGER IF EXISTS trg_auto_marital_status_insert ON family_members;
CREATE TRIGGER trg_auto_marital_status_insert
  BEFORE INSERT ON family_members
  FOR EACH ROW
  WHEN (NEW.spouse_ids IS NOT NULL AND array_length(NEW.spouse_ids, 1) > 0)
  EXECUTE FUNCTION auto_marital_status_on_spouse();


-- ── 4. Hard constraint: marital_status cannot be 'never_married' with spouses ──
-- Fires AFTER trg_auto_marital_status (PostgreSQL fires BEFORE triggers in
-- alphabetical name order; 'trg_validate' > 'trg_auto', so auto runs first and
-- corrects the common case).  Only fires when a caller explicitly tries to set
-- marital_status = 'never_married' on a member who still has spouse_ids entries.
CREATE OR REPLACE FUNCTION validate_marital_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.marital_status = 'never_married'
     AND array_length(NEW.spouse_ids, 1) > 0
  THEN
    RAISE EXCEPTION
      'marital_status cannot be ''never_married'' while spouse_ids contains % entry/entries. '
      'Use ''divorced'', ''separated'', or ''widowed'' to reflect the current status.',
      array_length(NEW.spouse_ids, 1)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_marital_status ON family_members;
CREATE TRIGGER trg_validate_marital_status
  BEFORE INSERT OR UPDATE OF marital_status, spouse_ids ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION validate_marital_status();


-- ── 5. Backfill: link all existing parent-pairs as spouses ─────────────────────
-- Processes every distinct (smaller_uuid, larger_uuid) parent pair found in
-- parent_ids arrays to avoid processing the same pair twice in different order.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT
      LEAST   (parent_ids[1], parent_ids[2]) AS p1,
      GREATEST(parent_ids[1], parent_ids[2]) AS p2
    FROM family_members
    WHERE array_length(parent_ids, 1) = 2
      AND deleted_at IS NULL
  LOOP
    -- p1 → p2 (migration 039 bidirectionality trigger handles p2 → p1).
    UPDATE family_members
    SET    spouse_ids = array_append(COALESCE(spouse_ids, '{}'), r.p2)
    WHERE  id = r.p1
      AND  NOT (COALESCE(spouse_ids, '{}') @> ARRAY[r.p2])
      AND  deleted_at IS NULL;
  END LOOP;
END $$;


-- ── 6. Backfill: marital_status = 'married' for existing spouses ───────────────
UPDATE family_members
SET    marital_status = 'married'
WHERE  array_length(spouse_ids, 1) > 0
  AND  COALESCE(marital_status, 'never_married') = 'never_married'
  AND  deleted_at IS NULL;


-- ── 7. Deprecate stored 'relationship' column ──────────────────────────────────
-- This text field was originally a user-supplied label ("son", "uncle") at join
-- time. All relationship labels are now derived dynamically from the graph
-- structure (parent_ids, spouse_ids, generation) in the application layer via
-- computeRelationLabel(). The column is kept for historical records only.
COMMENT ON COLUMN family_members.relationship IS
  'DEPRECATED: stored relationship labels are replaced by graph-derived labels '
  '(computeRelationLabel in lib/relation-engine.ts). Do not write to this column '
  'for new records.';
