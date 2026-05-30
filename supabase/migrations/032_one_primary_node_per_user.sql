-- Migration 032: Backfill for one-primary-node-per-user (index already in 026)
--
-- The partial unique index was created in migration 026:
--   CREATE UNIQUE INDEX IF NOT EXISTS idx_user_node_links_one_primary_per_user
--     ON public.user_node_links (user_id)
--     WHERE is_primary = true;
--
-- This migration only runs a backfill to demote any pre-existing duplicate
-- primary links (defensive, should not affect clean databases).

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY linked_at DESC NULLS LAST) AS rn
  FROM public.user_node_links
  WHERE is_primary = true
)
UPDATE public.user_node_links ul
  SET is_primary = false
  FROM ranked r
 WHERE ul.id = r.id
   AND r.rn > 1;
