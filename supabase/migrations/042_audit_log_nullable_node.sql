-- Migration 042: allow NULL node_id on claim_audit_log
-- ============================================================================
-- Root cause: migration 039 added the 'link_revoked' action so the
-- family-links/[id]/revoke route could write a structural audit entry. But that
-- entry has no associated family_members node (it concerns a family_links row),
-- so the route inserts node_id = NULL. claim_audit_log.node_id was declared
-- NOT NULL in migration 009, so every such insert silently failed (the route
-- fires it best-effort) and link revocations left no audit trail.
--
-- Fix: relax the NOT NULL constraint. node_id remains an FK with ON DELETE
-- CASCADE for node-scoped events; structural events (link_revoked) may leave it
-- NULL. All existing rows are unaffected.
-- ============================================================================

ALTER TABLE public.claim_audit_log
  ALTER COLUMN node_id DROP NOT NULL;
