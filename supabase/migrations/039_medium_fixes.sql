-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 039: medium-severity fixes
--
-- ISSUE-17: unique constraint on family_link_notifications to prevent
--           double-notifications from concurrent revoke/accept requests.
--
-- ISSUE-25: replace per-process in-memory rate limiter in phone-discovery
--           with a shared DB table so the limit applies globally across all
--           serverless instances.
--
-- ISSUE-26: enforce bidirectionality of spouse_ids links at the DB layer.
--           A trigger propagates each spouse_ids change to the other side.
--
-- Audit log: add 'link_revoked' action value to the check constraint so
--            the family-links revoke route can write a structural audit entry.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ISSUE-17: unique constraint on family_link_notifications ─────────────────
-- Multiple concurrent revoke requests both issue notifications. ON CONFLICT
-- DO NOTHING (via the upsert in the route) prevents duplicates once this
-- constraint is in place.
ALTER TABLE family_link_notifications
  ADD CONSTRAINT IF NOT EXISTS uniq_link_notification
  UNIQUE (link_id, event_type, recipient_family_id);

-- ── Audit log: add 'link_revoked' action value ───────────────────────────────
-- The family-links/[id]/revoke route now writes a structural audit entry.
-- Recreate the CHECK constraint including the new value.
ALTER TABLE claim_audit_log
  DROP CONSTRAINT IF EXISTS claim_audit_log_action_check;

ALTER TABLE claim_audit_log
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
    'merge_blocked',
    'link_revoked'   -- ISSUE-17: structural family-link revocation audit event
  ));

-- ── ISSUE-25: phone discovery rate limits table ───────────────────────────────
-- Stores one row per authenticated phone-discovery request. The route counts
-- rows within a sliding 60-second window per user_id before serving results.
-- Older rows are inert and can be cleaned up by: 
--   DELETE FROM phone_discovery_rate_limits WHERE created_at < now() - interval '1 hour';
CREATE TABLE IF NOT EXISTS phone_discovery_rate_limits (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip         text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_discovery_rl_user_time
  ON phone_discovery_rate_limits (user_id, created_at);

-- ── ISSUE-26: enforce bidirectionality of spouse_ids ─────────────────────────
-- When A.spouse_ids gains B, the trigger ensures B.spouse_ids gains A.
-- A session-variable guard (fg.spouse_sync) prevents the secondary UPDATE
-- from recursively re-firing the trigger, which would cause an infinite loop.

CREATE OR REPLACE FUNCTION sync_spouse_bidirectional() RETURNS TRIGGER AS $$
DECLARE
  added_spouse   uuid;
  removed_spouse uuid;
BEGIN
  -- Guard: skip if we are already inside a triggered sync to prevent infinite recursion.
  IF current_setting('fg.spouse_sync', true) = '1' THEN
    RETURN NEW;
  END IF;
  -- Set transaction-local flag (resets automatically at end of transaction).
  PERFORM set_config('fg.spouse_sync', '1', true);

  -- Add NEW.id to each newly linked spouse's spouse_ids (the NEW side of the update)
  FOR added_spouse IN (
    SELECT unnest(COALESCE(NEW.spouse_ids, '{}'))
    EXCEPT
    SELECT unnest(COALESCE(OLD.spouse_ids, '{}'))
  ) LOOP
    UPDATE family_members
    SET spouse_ids = array_append(COALESCE(spouse_ids, '{}'), NEW.id)
    WHERE id = added_spouse
      AND NOT (COALESCE(spouse_ids, '{}') @> ARRAY[NEW.id]);
  END LOOP;

  -- Remove NEW.id from each unlinked spouse's spouse_ids
  FOR removed_spouse IN (
    SELECT unnest(COALESCE(OLD.spouse_ids, '{}'))
    EXCEPT
    SELECT unnest(COALESCE(NEW.spouse_ids, '{}'))
  ) LOOP
    UPDATE family_members
    SET spouse_ids = array_remove(COALESCE(spouse_ids, '{}'), NEW.id)
    WHERE id = removed_spouse;
  END LOOP;

  PERFORM set_config('fg.spouse_sync', '0', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_spouse_bidirectionality ON family_members;
CREATE TRIGGER enforce_spouse_bidirectionality
  AFTER UPDATE OF spouse_ids ON family_members
  FOR EACH ROW
  WHEN (OLD.spouse_ids IS DISTINCT FROM NEW.spouse_ids)
  EXECUTE FUNCTION sync_spouse_bidirectional();

-- Handle INSERT: a new member created with pre-populated spouse_ids should
-- immediately appear in those spouses' spouse_ids arrays as well.
CREATE OR REPLACE FUNCTION sync_spouse_on_insert() RETURNS TRIGGER AS $$
DECLARE
  new_spouse uuid;
BEGIN
  IF current_setting('fg.spouse_sync', true) = '1' THEN RETURN NEW; END IF;
  IF NEW.spouse_ids IS NULL OR array_length(NEW.spouse_ids, 1) IS NULL THEN RETURN NEW; END IF;

  PERFORM set_config('fg.spouse_sync', '1', true);
  FOREACH new_spouse IN ARRAY NEW.spouse_ids LOOP
    UPDATE family_members
    SET spouse_ids = array_append(COALESCE(spouse_ids, '{}'), NEW.id)
    WHERE id = new_spouse
      AND NOT (COALESCE(spouse_ids, '{}') @> ARRAY[NEW.id]);
  END LOOP;
  PERFORM set_config('fg.spouse_sync', '0', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_spouse_on_insert ON family_members;
CREATE TRIGGER enforce_spouse_on_insert
  AFTER INSERT ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_spouse_on_insert();
