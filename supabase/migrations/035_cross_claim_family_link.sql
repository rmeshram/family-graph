-- Migration 035: Cross-claim family link support
--
-- Adds a partial index on family_links for O(1) pending-status checks
-- used by the cross-claim and link-request routes. Without this index
-- the "is this pair already linked?" query degrades to O(n) as the
-- family_links table grows.
--
-- Also adds initiated_by_user_id to family_link_notifications so the
-- rate-limiter in /api/family-links/cross-claim can count per-user attempts.

-- 1. Partial index for fast pending + accepted lookups on family_links
create index if not exists idx_family_links_status_pairs
  on public.family_links (family_a_id, family_b_id)
  where status in ('pending', 'accepted');

-- 2. Add initiated_by_user_id to family_link_notifications (nullable — existing rows unaffected)
alter table public.family_link_notifications
  add column if not exists initiated_by_user_id uuid references auth.users(id) on delete set null;

-- Index for rate-limit query: count recent cross_claim_attempt rows per user
create index if not exists idx_fln_rate_limit
  on public.family_link_notifications (initiated_by_user_id, event_type, created_at)
  where event_type = 'cross_claim_attempt';
