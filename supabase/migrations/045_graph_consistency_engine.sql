-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 045: graph consistency engine
--
-- Adds the remaining DB-level guards that the application-layer normalization
-- engine detects but that were not yet enforced at the database level:
--
--   1. Max 2 biological parents (CHECK constraint)
--   2. Child-as-spouse constraint (trigger: block A.spouse_ids ∋ B when B.parent_ids ∋ A)
--   3. Birth-year ordering (trigger: parent must be born before child, with
--      plausible age gap — persists warning to pending_conflicts, does NOT block)
--   4. Generation cascade trigger (AFTER UPDATE OF generation: cascades to direct
--      children so grandchildren and deeper descendants stay consistent after merges)
--   5. v_graph_integrity view: single query that returns all current integrity
--      violations across all families for the admin dashboard
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Max 2 biological parents ───────────────────────────────────────────────
-- Enforced as a CHECK constraint so it applies to direct REST/v1 writes too.
-- Migration 043 already blocks duplicate UUIDs in parent_ids; this adds the
-- upper-bound limit that prevents step-parents and in-laws from being added as
-- biological parents without explicit admin action.

ALTER TABLE family_members
  DROP CONSTRAINT IF EXISTS chk_max_two_parents;

ALTER TABLE family_members
  ADD CONSTRAINT chk_max_two_parents
  CHECK (array_length(parent_ids, 1) IS NULL OR array_length(parent_ids, 1) <= 2);


-- ── 2. Child-as-spouse constraint ─────────────────────────────────────────────
-- Fires BEFORE INSERT OR UPDATE OF spouse_ids.
-- For each id in NEW.spouse_ids: if that member lists NEW.id in their parent_ids,
-- the relationship is structurally impossible (parent ↔ spouse contradiction).
-- Raises an exception to block the write — unlike the birth-year check (rule 3)
-- this is always an error, never a plausible edge case.

CREATE OR REPLACE FUNCTION validate_no_child_as_spouse()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  bad_spouse_id UUID;
BEGIN
  SELECT s.id INTO bad_spouse_id
  FROM family_members s
  WHERE s.id = ANY(NEW.spouse_ids)
    AND s.deleted_at IS NULL
    AND NEW.id = ANY(s.parent_ids)
  LIMIT 1;

  IF bad_spouse_id IS NOT NULL THEN
    RAISE EXCEPTION
      'child_as_spouse: member % (%) is listed as a spouse of %, '
      'but % has % listed as a parent — a parent cannot also be a spouse. '
      'Remove % from one of the two relationship arrays before saving.',
      (SELECT name FROM family_members WHERE id = bad_spouse_id),
      bad_spouse_id,
      NEW.id,
      (SELECT name FROM family_members WHERE id = bad_spouse_id),
      NEW.id,
      bad_spouse_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_no_child_as_spouse ON family_members;
CREATE TRIGGER trg_validate_no_child_as_spouse
  BEFORE INSERT OR UPDATE OF spouse_ids ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION validate_no_child_as_spouse();


-- ── 3. Birth-year ordering guard (warning, non-blocking) ──────────────────────
-- Fires AFTER INSERT OR UPDATE OF parent_ids, birth_year on family_members.
-- Persists a pending_conflict warning when:
--   (a) a parent is born AFTER their child (impossible), or
--   (b) the age gap is < 12 years (biologically impossible), or
--   (c) the age gap is > 80 years (unusual — warn but allow).
-- Non-blocking because historical records sometimes have uncertain birth years.

CREATE OR REPLACE FUNCTION warn_birth_year_ordering()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  age_diff int;
BEGIN
  -- Only run if this member has a birth year and at least one parent
  IF NEW.birth_year IS NULL OR array_length(NEW.parent_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT p.id AS parent_id, p.name AS parent_name, p.birth_year AS parent_birth_year
    FROM family_members p
    WHERE p.id = ANY(NEW.parent_ids)
      AND p.birth_year IS NOT NULL
      AND p.deleted_at IS NULL
  LOOP
    age_diff := NEW.birth_year - r.parent_birth_year;

    IF age_diff < 0 OR age_diff < 12 OR age_diff > 80 THEN
      INSERT INTO pending_conflicts (
        family_id, node_id, conflict_type, description, severity, status, metadata
      )
      SELECT
        NEW.family_id,
        NEW.id,
        CASE
          WHEN age_diff < 0   THEN 'birth_year_impossible'
          WHEN age_diff < 12  THEN 'birth_year_impossible'
          ELSE                     'birth_year_gap'
        END,
        CASE
          WHEN age_diff < 0  THEN format(
            'Parent %s (b.%s) is born AFTER child %s (b.%s) — impossible.',
            r.parent_name, r.parent_birth_year, NEW.name, NEW.birth_year)
          WHEN age_diff < 12 THEN format(
            'Parent %s (b.%s) is only %s year(s) older than child %s (b.%s) — biologically impossible (minimum 12 years required).',
            r.parent_name, r.parent_birth_year, age_diff, NEW.name, NEW.birth_year)
          ELSE format(
            'Parent %s (b.%s) is %s years older than child %s (b.%s) — unusually large age gap. Please verify.',
            r.parent_name, r.parent_birth_year, age_diff, NEW.name, NEW.birth_year)
        END,
        CASE WHEN age_diff > 80 THEN 'warning' ELSE 'error' END,
        'open',
        jsonb_build_object(
          'parent_id',         r.parent_id,
          'parent_birth_year', r.parent_birth_year,
          'child_birth_year',  NEW.birth_year,
          'age_diff_years',    age_diff
        )
      WHERE NOT EXISTS (
        SELECT 1 FROM pending_conflicts pc
        WHERE pc.family_id = NEW.family_id
          AND pc.node_id = NEW.id
          AND pc.conflict_type IN ('birth_year_impossible', 'birth_year_gap')
          AND pc.status = 'open'
          AND (pc.metadata ->> 'parent_id') = r.parent_id::text
      );
    END IF;
  END LOOP;

  -- Auto-resolve stale birth-year warnings if the current values are now valid
  DELETE FROM pending_conflicts pc
  WHERE pc.family_id = NEW.family_id
    AND pc.node_id = NEW.id
    AND pc.conflict_type IN ('birth_year_impossible', 'birth_year_gap')
    AND pc.status = 'open'
    AND NOT EXISTS (
      SELECT 1 FROM family_members p
      WHERE p.id = (pc.metadata ->> 'parent_id')::uuid
        AND p.birth_year IS NOT NULL
        AND (
          NEW.birth_year - p.birth_year < 0
          OR NEW.birth_year - p.birth_year < 12
          OR NEW.birth_year - p.birth_year > 80
        )
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warn_birth_year_ordering ON family_members;
CREATE TRIGGER trg_warn_birth_year_ordering
  AFTER INSERT OR UPDATE OF parent_ids, birth_year ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION warn_birth_year_ordering();


-- ── 4. Generation cascade trigger ─────────────────────────────────────────────
-- When a member's generation changes, all their direct children may need their
-- generation updated too (the DB trigger in migration 043 only fires for the row
-- being written, not for rows that reference it as a parent).
-- This AFTER trigger touches each direct child's parent_ids to re-trigger
-- migration 043's auto-generation recalculation.
--
-- KNOWN LIMITATION — depth-1 only:
-- set_config() with is_local=true is transaction-local, not statement-local.
-- The fg.gen_cascade flag is therefore still '1' when each child's AFTER trigger
-- fires, so grandchildren are NOT cascaded here. Deep cascades are handled by
-- the application-layer BFS in cascadeDescendantGenerations() which is called
-- after every merge. Any direct REST/v1 generation write that affects grandchildren+
-- must trigger that RPC separately.

CREATE OR REPLACE FUNCTION cascade_generation_to_children()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Guard: skip if we are already inside a cascade to prevent runaway recursion
  -- on circular data (which rule 9 in the normalization engine detects separately).
  IF current_setting('fg.gen_cascade', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.generation IS DISTINCT FROM OLD.generation THEN
    PERFORM set_config('fg.gen_cascade', '1', true);

    -- Touching parent_ids triggers trg_family_member_data_quality (migration 043)
    -- which recalculates NEW.generation = max(parent_generation) + 1 for each child.
    -- The AFTER trigger fires for each updated child, which may then cascade further,
    -- but the fg.gen_cascade flag prevents re-entry within the same transaction
    -- per-connection. This is intentional: PostgreSQL fires triggers on a
    -- per-statement basis so each child's update produces a fresh trigger context.
    UPDATE family_members
    SET    parent_ids = parent_ids
    WHERE  NEW.id = ANY(parent_ids)
      AND  deleted_at IS NULL;

    PERFORM set_config('fg.gen_cascade', '0', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_generation ON family_members;
CREATE TRIGGER trg_cascade_generation
  AFTER UPDATE OF generation ON family_members
  FOR EACH ROW
  WHEN (NEW.generation IS DISTINCT FROM OLD.generation)
  EXECUTE FUNCTION cascade_generation_to_children();


-- ── 5. v_graph_integrity view ─────────────────────────────────────────────────
-- Aggregates all current integrity violations into a single admin-queryable
-- view. Supersedes (but does not replace) the graph_integrity_check() RPC
-- from migration 040 — this view is cheaper and always up-to-date.
-- Requires service_role or an RLS policy that grants admin access.

CREATE OR REPLACE VIEW v_graph_integrity AS

-- 5a. Dangling parent references (parent_id not in family_members or deleted)
SELECT
  fm.family_id,
  fm.id        AS node_id,
  fm.name      AS node_name,
  'dangling_parent_ref' AS issue_type,
  format('parent_ids contains non-existent/deleted ID: %s', pid) AS description
FROM family_members fm,
     LATERAL unnest(fm.parent_ids) AS pid
WHERE fm.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM family_members p
    WHERE p.id = pid AND p.deleted_at IS NULL
  )

UNION ALL

-- 5b. Dangling spouse references
SELECT
  fm.family_id,
  fm.id,
  fm.name,
  'dangling_spouse_ref',
  format('spouse_ids contains non-existent/deleted ID: %s', sid)
FROM family_members fm,
     LATERAL unnest(fm.spouse_ids) AS sid
WHERE fm.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM family_members s
    WHERE s.id = sid AND s.deleted_at IS NULL
  )

UNION ALL

-- 5c. Unidirectional spouse (A lists B as spouse but B does not list A)
SELECT
  a.family_id,
  a.id,
  a.name,
  'unidirectional_spouse',
  format('%s (%s) lists %s (%s) as spouse but the link is not reciprocated',
         a.name, a.id, b.name, b.id)
FROM family_members a
JOIN family_members b ON b.id = ANY(a.spouse_ids)
WHERE a.deleted_at IS NULL
  AND b.deleted_at IS NULL
  AND NOT (a.id = ANY(b.spouse_ids))

UNION ALL

-- 5d. Self-parent
SELECT
  fm.family_id,
  fm.id,
  fm.name,
  'self_parent',
  format('%s (%s) lists itself as a parent', fm.name, fm.id)
FROM family_members fm
WHERE fm.deleted_at IS NULL
  AND fm.id = ANY(fm.parent_ids)

UNION ALL

-- 5e. Self-spouse
SELECT
  fm.family_id,
  fm.id,
  fm.name,
  'self_spouse',
  format('%s (%s) lists itself as a spouse', fm.name, fm.id)
FROM family_members fm
WHERE fm.deleted_at IS NULL
  AND fm.id = ANY(fm.spouse_ids)

UNION ALL

-- 5f. Child-as-spouse (A is in B.spouse_ids AND A is in B.parent_ids)
SELECT
  child.family_id,
  child.id,
  child.name,
  'child_as_spouse',
  format('%s (%s) appears in both spouse_ids and parent_ids of the same member',
         child.name, child.id)
FROM family_members child
JOIN family_members parent_member
  ON parent_member.deleted_at IS NULL
  AND child.id = ANY(parent_member.spouse_ids)
  AND child.id = ANY(parent_member.parent_ids)
WHERE child.deleted_at IS NULL

UNION ALL

-- 5g. Generation ordering violation (parent gen >= child gen)
SELECT
  fm.family_id,
  fm.id,
  fm.name,
  'generation_mismatch',
  format('%s (gen %s) has parent %s (gen %s) — parent must have lower generation',
         fm.name, fm.generation, p.name, p.generation)
FROM family_members fm
JOIN family_members p ON p.id = ANY(fm.parent_ids)
WHERE fm.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND p.generation >= fm.generation

UNION ALL

-- 5h. Open pending_conflicts (deduplicated by node + type)
SELECT DISTINCT
  pc.family_id,
  pc.node_id,
  COALESCE(fm.name, '(unknown)'),
  pc.conflict_type::text,
  pc.description
FROM pending_conflicts pc
LEFT JOIN family_members fm ON fm.id = pc.node_id AND fm.deleted_at IS NULL
WHERE pc.status = 'open';


-- ── 6. Backfill: run birth-year warnings against all existing data ─────────────
-- Evaluate existing parent-child pairs and create pending_conflicts entries
-- for any pairs that violate the birth-year ordering rule.

DO $$
DECLARE
  r RECORD;
  age_diff int;
BEGIN
  FOR r IN
    SELECT
      fm.id         AS child_id,
      fm.family_id,
      fm.name       AS child_name,
      fm.birth_year AS child_birth_year,
      p.id          AS parent_id,
      p.name        AS parent_name,
      p.birth_year  AS parent_birth_year
    FROM family_members fm
    JOIN family_members p ON p.id = ANY(fm.parent_ids)
    WHERE fm.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND fm.birth_year IS NOT NULL
      AND p.birth_year IS NOT NULL
  LOOP
    age_diff := r.child_birth_year - r.parent_birth_year;

    IF age_diff < 0 OR age_diff < 12 OR age_diff > 80 THEN
      INSERT INTO pending_conflicts (
        family_id, node_id, conflict_type, description, severity, status, metadata
      )
      SELECT
        r.family_id,
        r.child_id,
        CASE WHEN age_diff <= 80 THEN 'birth_year_impossible' ELSE 'birth_year_gap' END,
        CASE
          WHEN age_diff < 0  THEN format(
            'Parent %s (b.%s) is born AFTER child %s (b.%s) — impossible.',
            r.parent_name, r.parent_birth_year, r.child_name, r.child_birth_year)
          WHEN age_diff < 12 THEN format(
            'Parent %s (b.%s) is only %s year(s) older than child %s (b.%s) — biologically impossible.',
            r.parent_name, r.parent_birth_year, age_diff, r.child_name, r.child_birth_year)
          ELSE format(
            'Parent %s (b.%s) is %s years older than child %s (b.%s) — unusually large gap.',
            r.parent_name, r.parent_birth_year, age_diff, r.child_name, r.child_birth_year)
        END,
        CASE WHEN age_diff > 80 THEN 'warning' ELSE 'error' END,
        'open',
        jsonb_build_object(
          'parent_id',         r.parent_id,
          'parent_birth_year', r.parent_birth_year,
          'child_birth_year',  r.child_birth_year,
          'age_diff_years',    age_diff
        )
      WHERE NOT EXISTS (
        SELECT 1 FROM pending_conflicts pc
        WHERE pc.family_id = r.family_id
          AND pc.node_id = r.child_id
          AND pc.conflict_type IN ('birth_year_impossible', 'birth_year_gap')
          AND pc.status = 'open'
          AND (pc.metadata ->> 'parent_id') = r.parent_id::text
      );
    END IF;
  END LOOP;
END $$;
