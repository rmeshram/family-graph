-- Migration 036: Fix family_link_notifications so inserts actually work
--
-- The original table schema required source_family_id and new_member_id as
-- NOT NULL, but every API route that writes to this table (revoke, respond,
-- link-request, cross-claim) omits those columns — they're only meaningful
-- for "member joined via link" events, not for link lifecycle events
-- (link_requested, link_accepted, link_revoked, cross_claim_attempt).
--
-- Without this migration every family-link notification INSERT silently fails
-- (Supabase returns an error that routes swallow with `as any`), meaning:
--   - The rate-limiter in /api/family-links/cross-claim never counts attempts
--   - The FamilyLinkRequestsBanner gets no real-time pushes
--   - The notification bell never shows family connection events

ALTER TABLE public.family_link_notifications
  ALTER COLUMN source_family_id DROP NOT NULL;

ALTER TABLE public.family_link_notifications
  ALTER COLUMN new_member_id DROP NOT NULL;

-- link_id must also be nullable for rate-limit sentinel rows that are
-- written before the family_links row exists (or for orphaned events).
ALTER TABLE public.family_link_notifications
  ALTER COLUMN link_id DROP NOT NULL;
