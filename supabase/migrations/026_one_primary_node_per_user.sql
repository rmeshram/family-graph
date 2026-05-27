-- Migration 026: One primary node per account
-- Enforces one-account-one-node across all families.

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_node_links_one_primary_per_user
  ON public.user_node_links(user_id)
  WHERE is_primary = true;
