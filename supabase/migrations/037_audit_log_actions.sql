-- Migration 037: Audit log action constraint update
-- ============================================================================
-- Adds 'merge_blocked' to the claim_audit_log action check constraint.
--
-- Root cause: the merge route inserts action='merge_blocked' when two claimed
-- nodes are involved (BOTH_CLAIMED guard). This value was missing from the
-- constraint defined in migration 033, so those inserts silently failed —
-- blocked merge attempts left no audit trail.
--
-- Also removes 'node_merged' (never in the constraint; code now uses 'nodes_merged')
-- so the constraint and the code stay in sync.
-- ============================================================================

ALTER TABLE public.claim_audit_log
  DROP CONSTRAINT IF EXISTS claim_audit_log_action_check;

ALTER TABLE public.claim_audit_log
  ADD CONSTRAINT claim_audit_log_action_check
  CHECK (action IN (
    'claim_initiated',
    'claim_verified',
    'claim_completed',
    'claim_rejected',
    'claim_abandoned',
    'claim_revoked',
    'claim_unclaimed',
    'match_dismissed',
    'invite_sent',
    'invite_expired',
    'invite_refreshed',
    'nodes_merged',
    'guardian_claimed',
    'merge_claim_transfer',
    'claim_transferred',
    'node_archived',
    'node_restored',
    'merge_blocked'   -- RF-08: BOTH_CLAIMED guard in merge route
  ));
