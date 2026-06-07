-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 040: graph integrity — legacy data repair + validator
--
-- GAP-2: Fix legacy rows where claimed_by_user_id IS NOT NULL but is_claimed is
--        still false (caused by the old join-create route before ISSUE-03 fix).
--        Also patch rows where claim_status is still 'unclaimed' despite having
--        a claimer, so UI filters and permission checks work consistently.
--
-- GAP-1: Add graph_integrity_check() SQL function so the admin API route
--        can scan for dangling edges, one-way spouse links, and deleted-node
--        references without performing a full table scan in application code.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── GAP-2: Back-fill claim fields for legacy join-create members ──────────────
UPDATE family_members
SET
  is_claimed    = true,
  claim_status  = 'claimed',
  claimed_at    = COALESCE(claimed_at, updated_at, added_at, now())
WHERE
  claimed_by_user_id IS NOT NULL
  AND (is_claimed IS DISTINCT FROM true OR claim_status IS DISTINCT FROM 'claimed')
  AND deleted_at IS NULL;

-- Log how many rows were patched (shows in migration output)
DO $$
DECLARE patched_count int;
BEGIN
  GET DIAGNOSTICS patched_count = ROW_COUNT;
  RAISE NOTICE 'migration 040: patched % family_members rows with stale claim fields', patched_count;
END $$;

-- ── GAP-1: Graph integrity validator function ─────────────────────────────────
-- Returns a JSONB report with counts and example IDs for each integrity class.
-- Designed to be called from /api/admin/graph-integrity via supabase.rpc().
-- Each check targets only non-deleted nodes (deleted_at IS NULL).
--
-- Checks:
--   1. dangling_parent_refs   — parent_ids contains an ID that does not exist
--                               or is soft-deleted
--   2. dangling_spouse_refs   — spouse_ids contains an ID that does not exist
--                               or is soft-deleted
--   3. one_way_spouse         — A.spouse_ids has B but B.spouse_ids does not
--                               have A (predates migration 039 trigger)
--   4. orphan_claimed_node    — is_claimed=true but claimed_by_user_id is null
--   5. stale_claim_fields     — claimed_by_user_id set but is_claimed=false
--                               (should be 0 after the UPDATE above)
CREATE OR REPLACE FUNCTION public.graph_integrity_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dangling_parent   jsonb;
  v_dangling_spouse   jsonb;
  v_one_way_spouse    jsonb;
  v_orphan_claimed    jsonb;
  v_stale_claim       jsonb;
  v_total_members     bigint;
  v_live_members      bigint;
BEGIN
  SELECT count(*) INTO v_total_members FROM family_members;
  SELECT count(*) INTO v_live_members  FROM family_members WHERE deleted_at IS NULL;

  -- 1. Dangling parent references
  SELECT jsonb_build_object(
    'count', count(*),
    'examples', jsonb_agg(sub.id ORDER BY sub.id) FILTER (WHERE sub.rn <= 5)
  )
  INTO v_dangling_parent
  FROM (
    SELECT fm.id, row_number() OVER () AS rn
    FROM   family_members fm,
           unnest(fm.parent_ids) AS pid
    WHERE  fm.deleted_at IS NULL
    AND    NOT EXISTS (
             SELECT 1 FROM family_members p
             WHERE  p.id = pid AND p.deleted_at IS NULL
           )
  ) sub;

  -- 2. Dangling spouse references
  SELECT jsonb_build_object(
    'count', count(*),
    'examples', jsonb_agg(sub.id ORDER BY sub.id) FILTER (WHERE sub.rn <= 5)
  )
  INTO v_dangling_spouse
  FROM (
    SELECT fm.id, row_number() OVER () AS rn
    FROM   family_members fm,
           unnest(fm.spouse_ids) AS sid
    WHERE  fm.deleted_at IS NULL
    AND    NOT EXISTS (
             SELECT 1 FROM family_members s
             WHERE  s.id = sid AND s.deleted_at IS NULL
           )
  ) sub;

  -- 3. One-way spouse links (A has B but B doesn't have A)
  SELECT jsonb_build_object(
    'count', count(*),
    'examples', jsonb_agg(sub.node_id ORDER BY sub.node_id) FILTER (WHERE sub.rn <= 5)
  )
  INTO v_one_way_spouse
  FROM (
    SELECT fm.id AS node_id, row_number() OVER () AS rn
    FROM   family_members fm,
           unnest(fm.spouse_ids) AS sid
    WHERE  fm.deleted_at IS NULL
    AND    EXISTS (
             SELECT 1 FROM family_members s
             WHERE  s.id = sid AND s.deleted_at IS NULL
           )
    AND    NOT EXISTS (
             SELECT 1 FROM family_members s
             WHERE  s.id = sid
             AND    fm.id = ANY(COALESCE(s.spouse_ids, '{}'))
           )
  ) sub;

  -- 4. Claimed node with no claimer identity
  SELECT jsonb_build_object(
    'count', count(*),
    'examples', jsonb_agg(id ORDER BY id) FILTER (WHERE row_number() OVER () <= 5)
  )
  INTO v_orphan_claimed
  FROM family_members
  WHERE deleted_at IS NULL
  AND   is_claimed = true
  AND   claimed_by_user_id IS NULL;

  -- 5. Stale claim fields (should be 0 after this migration's UPDATE)
  SELECT jsonb_build_object(
    'count', count(*),
    'examples', jsonb_agg(id ORDER BY id) FILTER (WHERE row_number() OVER () <= 5)
  )
  INTO v_stale_claim
  FROM family_members
  WHERE deleted_at IS NULL
  AND   claimed_by_user_id IS NOT NULL
  AND   (is_claimed IS DISTINCT FROM true OR claim_status IS DISTINCT FROM 'claimed');

  RETURN jsonb_build_object(
    'checked_at',          now(),
    'total_members',       v_total_members,
    'live_members',        v_live_members,
    'dangling_parent_refs', v_dangling_parent,
    'dangling_spouse_refs', v_dangling_spouse,
    'one_way_spouse_links', v_one_way_spouse,
    'orphan_claimed_nodes', v_orphan_claimed,
    'stale_claim_fields',   v_stale_claim,
    'healthy',             (
      (v_dangling_parent->>'count')::int  = 0 AND
      (v_dangling_spouse->>'count')::int  = 0 AND
      (v_one_way_spouse->>'count')::int   = 0 AND
      (v_orphan_claimed->>'count')::int   = 0 AND
      (v_stale_claim->>'count')::int      = 0
    )
  );
END $$;

-- Grant execute only to service-role (used by the admin API route only)
REVOKE EXECUTE ON FUNCTION public.graph_integrity_check() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.graph_integrity_check() TO service_role;

-- ── GAP-1: One-shot repair of one-way spouse links created before migration 039
-- Run after the trigger is in place so each UPDATE fires sync_spouse_bidirectional.
-- Wrapped in a DO block so it can be re-run safely (idempotent via trigger guard).
DO $$
DECLARE
  fixed_count int := 0;
  rec         record;
BEGIN
  FOR rec IN
    SELECT DISTINCT fm.id AS node_id, sid AS spouse_id
    FROM   family_members fm, unnest(fm.spouse_ids) AS sid
    WHERE  fm.deleted_at IS NULL
    AND    EXISTS (SELECT 1 FROM family_members s WHERE s.id = sid AND s.deleted_at IS NULL)
    AND    NOT EXISTS (
             SELECT 1 FROM family_members s
             WHERE  s.id = sid AND fm.id = ANY(COALESCE(s.spouse_ids, '{}'))
           )
  LOOP
    UPDATE family_members
    SET    spouse_ids = array_append(COALESCE(spouse_ids, '{}'), rec.node_id)
    WHERE  id = rec.spouse_id
    AND    NOT (COALESCE(spouse_ids, '{}') @> ARRAY[rec.node_id]);
    fixed_count := fixed_count + 1;
  END LOOP;
  RAISE NOTICE 'migration 040: repaired % one-way spouse links', fixed_count;
END $$;
