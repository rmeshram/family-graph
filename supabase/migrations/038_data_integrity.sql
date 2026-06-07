-- Migration 038: Data integrity constraints
-- DCR-01 + EC-23: DB-level self-parent prevention and stale pending claim cleanup
--
-- DCR-01: A node must not list itself as its own parent.
-- Without this constraint a single bad write can create an infinite loop in
-- any graph traversal (ancestor path, tree rendering, relation-engine scoring).
-- We enforce it at the DB level so no application bug or direct SQL write can
-- bypass it, regardless of whether the API call goes through the claim route.
--
-- EC-23: Stale 'pending' claim_requests that have passed their expires_at are
-- invisible to the API (all queries filter .gt('expires_at', now())) but they
-- accumulate in the table and inflate rate-limit counts. A scheduled pg_cron
-- job or a one-shot cleanup function is provided here.
-- If pg_cron is not enabled, run the DELETE manually during maintenance windows.
-- The recommended schedule is every 6 hours.

-- ─────────────────────────────────────────────────────────────────────────────
-- DCR-01: Prevent self-referential parent_ids
-- ─────────────────────────────────────────────────────────────────────────────
-- The constraint uses the && (overlaps) operator: if the array of parent_ids
-- contains the row's own id, reject the write.
-- We check ARRAY[id] && parent_ids so it works even when parent_ids is empty
-- (empty && anything = false, so no false positives).
ALTER TABLE family_members
  DROP CONSTRAINT IF EXISTS no_self_parent;

ALTER TABLE family_members
  ADD CONSTRAINT no_self_parent
  CHECK (NOT (parent_ids @> ARRAY[id]));

-- Also block self-spouse for symmetry (equally graph-breaking):
ALTER TABLE family_members
  DROP CONSTRAINT IF EXISTS no_self_spouse;

ALTER TABLE family_members
  ADD CONSTRAINT no_self_spouse
  CHECK (NOT (spouse_ids @> ARRAY[id]));

-- ─────────────────────────────────────────────────────────────────────────────
-- EC-23: Clean up expired pending claim_requests
-- ─────────────────────────────────────────────────────────────────────────────
-- Create a helper function that can be called from pg_cron or manually.
-- Deletes claim_requests that are still 'pending' but whose expires_at has
-- passed. This keeps the table lean and prevents stale rows from skewing the
-- per-user hourly rate-limit count.
CREATE OR REPLACE FUNCTION cleanup_expired_claim_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM claim_requests
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

-- ── Uncomment the block below if pg_cron is available (requires pg_cron extension) ──
-- To enable pg_cron on Supabase: go to Database → Extensions → enable pg_cron.
-- Then uncomment and run this block once:
--
-- SELECT cron.schedule(
--   'cleanup-expired-claim-requests',   -- job name (must be unique)
--   '0 */6 * * *',                       -- every 6 hours
--   $$SELECT cleanup_expired_claim_requests()$$
-- );
--
-- Verify: SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-claim-requests';
-- Remove: SELECT cron.unschedule('cleanup-expired-claim-requests');
