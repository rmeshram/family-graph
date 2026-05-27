-- Migration 024: Claim Integrity
-- ============================================================================
-- 1. identity_state column on family_members — explicit 9-value lifecycle enum
--    that is the authoritative state for node identity.  The existing
--    claim_status column is preserved for backward compatibility; new code
--    should read/write identity_state.
-- 2. Partial unique index on claim_requests — at most ONE pending claim per
--    node at any given time.  This turns the application-level race-condition
--    check into a DB-enforced hard constraint (prevents two users from both
--    reaching claim_status='pending' for the same node simultaneously).
-- ============================================================================

-- ── 1. Add identity_state ────────────────────────────────────────────────────

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS identity_state TEXT NOT NULL DEFAULT 'unclaimed'
  CHECK (identity_state IN (
    'unclaimed',
    'invited',
    'claim_pending',
    'soft_match',
    'verified',
    'claimed',
    'revoked',
    'disputed',
    'merged'
  ));

-- Backfill from the existing claim_status + is_claimed columns so the new
-- column is immediately consistent for all existing rows.
UPDATE family_members
SET identity_state =
  CASE
    WHEN is_claimed = TRUE AND claimed_by_user_id IS NOT NULL THEN 'claimed'
    WHEN claim_status = 'revoked'                             THEN 'revoked'
    WHEN claim_status = 'invite_sent'                        THEN 'invited'
    WHEN claim_status IN (
           'claim_pending', 'pending_admin_review'
         )                                                   THEN 'claim_pending'
    ELSE 'unclaimed'
  END;

-- Fast lookup by identity_state (admin moderation dashboard, PYMK filtering)
CREATE INDEX IF NOT EXISTS idx_fm_identity_state
  ON family_members(family_id, identity_state);

-- ── 2. Partial unique index — one pending claim per node ─────────────────────
-- Prevents the race condition where two users simultaneously submit claim
-- requests that both pass the application-level rival-claim check.
-- The second INSERT/UPSERT will receive a unique-violation error, which the
-- claim route surfaces as CLAIM_PENDING_ANOTHER_USER (409).
--
-- NOTE: The upsert in /api/nodes/[id]/claim uses ON CONFLICT (node_id,
-- claimant_user_id), which is scoped per-user.  This additional index is
-- scoped per-node, making the combined constraint airtight.
CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_requests_one_pending_per_node
  ON claim_requests(node_id)
  WHERE status = 'pending';

-- ── 3. Keep identity_state in sync via trigger ───────────────────────────────
-- When claim_status or is_claimed is updated on a row (e.g. by the legacy
-- joinWithCode hook), mirror the change to identity_state automatically.
-- This ensures the two columns never diverge without all callers being updated.

CREATE OR REPLACE FUNCTION sync_identity_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.identity_state :=
    CASE
      WHEN NEW.is_claimed = TRUE AND NEW.claimed_by_user_id IS NOT NULL THEN 'claimed'
      WHEN NEW.claim_status = 'revoked'                                 THEN 'revoked'
      WHEN NEW.claim_status = 'invite_sent'                             THEN 'invited'
      WHEN NEW.claim_status IN (
             'claim_pending', 'pending_admin_review'
           )                                                            THEN 'claim_pending'
      ELSE 'unclaimed'
    END;

  -- If the caller explicitly set identity_state to a richer state that the
  -- claim_status backfill logic doesn't know about (e.g. 'soft_match',
  -- 'disputed', 'merged'), preserve it rather than downgrading.
  IF OLD.identity_state IN ('soft_match', 'verified', 'disputed', 'merged')
     AND NEW.identity_state = 'claim_pending' THEN
    NEW.identity_state := OLD.identity_state;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_identity_state ON family_members;
CREATE TRIGGER trg_sync_identity_state
  BEFORE UPDATE OF claim_status, is_claimed, claimed_by_user_id
  ON family_members
  FOR EACH ROW EXECUTE FUNCTION sync_identity_state();
