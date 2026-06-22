-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 043: family_members data-quality guards (DB-level)
--
-- Enforces for all future writes (including direct rest/v1 calls):
--   1) No duplicate UUIDs in parent_ids/spouse_ids
--   2) No self-references in parent_ids/spouse_ids
--   3) All referenced UUIDs must exist and be live (deleted_at IS NULL)
--   4) generation is auto-derived from parent relationships
--   5) Duplicate-name warning persisted to pending_conflicts
--
-- NOTE: spouse bidirectionality is already enforced by migration 039 triggers.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_family_member_data_quality()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bad_parent_ids uuid[];
  v_bad_spouse_ids uuid[];
  v_distinct_parent_count int;
  v_distinct_spouse_count int;
  v_parent_max_generation int;
  v_name_key text;
  v_duplicate_count int;
BEGIN
  NEW.parent_ids := COALESCE(NEW.parent_ids, '{}');
  NEW.spouse_ids := COALESCE(NEW.spouse_ids, '{}');

  -- 1) No duplicate UUIDs in parent_ids
  SELECT count(DISTINCT x) INTO v_distinct_parent_count
  FROM unnest(NEW.parent_ids) AS x;
  IF v_distinct_parent_count <> COALESCE(array_length(NEW.parent_ids, 1), 0) THEN
    RAISE EXCEPTION 'parent_ids cannot contain duplicate UUIDs (member: %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1) No duplicate UUIDs in spouse_ids
  SELECT count(DISTINCT x) INTO v_distinct_spouse_count
  FROM unnest(NEW.spouse_ids) AS x;
  IF v_distinct_spouse_count <> COALESCE(array_length(NEW.spouse_ids, 1), 0) THEN
    RAISE EXCEPTION 'spouse_ids cannot contain duplicate UUIDs (member: %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5) No self-references
  IF NEW.id = ANY(NEW.parent_ids) THEN
    RAISE EXCEPTION 'member cannot list itself as parent (member: %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.id = ANY(NEW.spouse_ids) THEN
    RAISE EXCEPTION 'member cannot list itself as spouse (member: %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4) All referenced parent UUIDs must exist and be live
  SELECT array_agg(pid)
  INTO v_bad_parent_ids
  FROM unnest(NEW.parent_ids) AS pid
  WHERE NOT EXISTS (
    SELECT 1
    FROM family_members p
    WHERE p.id = pid
      AND p.deleted_at IS NULL
  );

  IF v_bad_parent_ids IS NOT NULL AND array_length(v_bad_parent_ids, 1) > 0 THEN
    RAISE EXCEPTION 'parent_ids contains non-existent/deleted UUID(s): %', v_bad_parent_ids
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 4) All referenced spouse UUIDs must exist and be live
  SELECT array_agg(sid)
  INTO v_bad_spouse_ids
  FROM unnest(NEW.spouse_ids) AS sid
  WHERE NOT EXISTS (
    SELECT 1
    FROM family_members s
    WHERE s.id = sid
      AND s.deleted_at IS NULL
  );

  IF v_bad_spouse_ids IS NOT NULL AND array_length(v_bad_spouse_ids, 1) > 0 THEN
    RAISE EXCEPTION 'spouse_ids contains non-existent/deleted UUID(s): %', v_bad_spouse_ids
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 2) Auto-generation from parent relationships
  IF COALESCE(array_length(NEW.parent_ids, 1), 0) > 0 THEN
    SELECT max(p.generation)
    INTO v_parent_max_generation
    FROM family_members p
    WHERE p.id = ANY(NEW.parent_ids)
      AND p.deleted_at IS NULL;

    IF v_parent_max_generation IS NULL THEN
      RAISE EXCEPTION 'cannot derive generation: no valid parents found (member: %)', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.generation := v_parent_max_generation + 1;
  ELSIF NEW.generation IS NULL THEN
    -- Root node default when generation omitted
    NEW.generation := 0;
  END IF;

  -- 6) Warn on duplicate names in same family (persist warning, do not block)
  v_name_key := lower(regexp_replace(trim(COALESCE(NEW.name, '')), '\s+', ' ', 'g'));

  IF v_name_key <> '' THEN
    SELECT count(*)
    INTO v_duplicate_count
    FROM family_members fm
    WHERE fm.family_id = NEW.family_id
      AND fm.deleted_at IS NULL
      AND fm.id <> NEW.id
      AND lower(regexp_replace(trim(COALESCE(fm.name, '')), '\s+', ' ', 'g')) = v_name_key;

    IF v_duplicate_count > 0 THEN
      INSERT INTO pending_conflicts (
        family_id,
        node_id,
        conflict_type,
        description,
        severity,
        status,
        metadata
      )
      SELECT
        NEW.family_id,
        NEW.id,
        'duplicate_identity',
        format('Duplicate-name warning: "%s" already exists %s time(s) in this family. Manual review recommended.', NEW.name, v_duplicate_count),
        'warning',
        'open',
        jsonb_build_object('name_key', v_name_key, 'duplicate_count', v_duplicate_count)
      WHERE NOT EXISTS (
        SELECT 1
        FROM pending_conflicts pc
        WHERE pc.family_id = NEW.family_id
          AND pc.node_id = NEW.id
          AND pc.conflict_type = 'duplicate_identity'
          AND pc.status = 'open'
          AND (pc.metadata ->> 'name_key') = v_name_key
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_member_data_quality ON family_members;
CREATE TRIGGER trg_family_member_data_quality
  BEFORE INSERT OR UPDATE OF name, parent_ids, spouse_ids, generation ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_family_member_data_quality();
