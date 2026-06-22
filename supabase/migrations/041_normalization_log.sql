-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 041: normalization persistence infrastructure
--
-- Adds:
--   1. normalization_audit_log — immutable record of every in-memory
--      dedup merge that the normalization pipeline commits to the DB.
--      Enables rollback inspection and audit trails for admin review.
--
--   2. rewrite_member_refs(family_id, duplicate_id, canonical_id)
--      Postgres function (SECURITY DEFINER, service_role only) that
--      rewrites every parent_ids / spouse_ids reference to duplicate_id
--      across the entire family in a single UPDATE statement.
--      Called by /api/admin/normalize-graph after soft-deleting the
--      duplicate node.
--
--   3. normalize_field_fix(member_id, field, new_value)
--      Generic helper that applies a single array-field correction.
--      Used for Phase 1 fixes: dangling refs, one-way spouse links,
--      generation corrections.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Normalization audit log ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS normalization_audit_log (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id          uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  canonical_id       uuid        NOT NULL,
  merged_from_id     uuid        NOT NULL,
  canonical_name     text        NOT NULL,
  merged_from_name   text        NOT NULL,
  confidence         int         NOT NULL,
  match_reasons      text[]      NOT NULL DEFAULT '{}',
  merged_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  merged_at          timestamptz NOT NULL DEFAULT now(),
  -- JSON map of scalar fields transferred from duplicate to canonical
  -- e.g. { "birth_year": { "from": null, "to": 1962 } }
  field_updates      jsonb       NOT NULL DEFAULT '{}',
  -- Count of OTHER nodes whose parent_ids/spouse_ids were rewritten
  ref_rewrites       int         NOT NULL DEFAULT 0,
  -- Complete DB snapshot of the duplicate row before deletion (for rollback)
  duplicate_snapshot jsonb       NOT NULL DEFAULT '{}',
  CONSTRAINT normalization_audit_log_confidence_check
    CHECK (confidence BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS normalization_audit_log_family_time
  ON normalization_audit_log (family_id, merged_at DESC);

CREATE INDEX IF NOT EXISTS normalization_audit_log_canonical
  ON normalization_audit_log (canonical_id);

CREATE INDEX IF NOT EXISTS normalization_audit_log_merged_from
  ON normalization_audit_log (merged_from_id);

ALTER TABLE normalization_audit_log ENABLE ROW LEVEL SECURITY;

-- Family admins can view their own family's normalization history
DROP POLICY IF EXISTS "admins can view normalization log" ON normalization_audit_log;
CREATE POLICY "admins can view normalization log"
  ON normalization_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE  p.id = auth.uid()
        AND  p.family_id = normalization_audit_log.family_id
        AND  p.role = 'admin'
    )
  );

-- Only service_role can insert (API route uses admin client)
-- No INSERT policy for authenticated users — the API route is the sole writer.

-- ── 2. rewrite_member_refs ────────────────────────────────────────────────────
-- Replaces every occurrence of p_duplicate_id with p_canonical_id in
-- parent_ids and spouse_ids for all live members in p_family_id.
-- Returns the number of rows updated.
--
-- This runs in a single SQL UPDATE to avoid N application-level round-trips
-- and ensures atomicity at the statement level.

CREATE OR REPLACE FUNCTION public.rewrite_member_refs(
  p_family_id    uuid,
  p_duplicate_id uuid,
  p_canonical_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE family_members
  SET
    parent_ids = array_replace(COALESCE(parent_ids, '{}'), p_duplicate_id, p_canonical_id),
    spouse_ids = array_replace(COALESCE(spouse_ids, '{}'), p_duplicate_id, p_canonical_id),
    updated_at = now()
  WHERE family_id   = p_family_id
    AND id          NOT IN (p_duplicate_id, p_canonical_id)
    AND deleted_at  IS NULL
    AND (
      COALESCE(parent_ids, '{}') @> ARRAY[p_duplicate_id]
      OR
      COALESCE(spouse_ids, '{}') @> ARRAY[p_duplicate_id]
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Only service_role can call this — never via anon/authenticated key
GRANT  EXECUTE ON FUNCTION public.rewrite_member_refs(uuid, uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.rewrite_member_refs(uuid, uuid, uuid) FROM PUBLIC;

-- ── 3. normalize_field_fix ────────────────────────────────────────────────────
-- Applies a corrected parent_ids or spouse_ids array to a single node.
-- Used by Phase 1 field fixes (dangling refs, one-way spouse links).
-- generation_fix is handled by a direct UPDATE in the application layer
-- since generation is a scalar int, not an array.

CREATE OR REPLACE FUNCTION public.normalize_field_fix(
  p_member_id uuid,
  p_field     text,      -- 'parent_ids' or 'spouse_ids'
  p_new_value uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field = 'parent_ids' THEN
    UPDATE family_members SET parent_ids = p_new_value, updated_at = now()
    WHERE id = p_member_id AND deleted_at IS NULL;
  ELSIF p_field = 'spouse_ids' THEN
    UPDATE family_members SET spouse_ids = p_new_value, updated_at = now()
    WHERE id = p_member_id AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'normalize_field_fix: unsupported field %', p_field;
  END IF;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.normalize_field_fix(uuid, text, uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.normalize_field_fix(uuid, text, uuid[]) FROM PUBLIC;
