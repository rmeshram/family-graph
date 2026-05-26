-- Migration 021: Governance Layer
-- ============================================================================
-- Adds:
--   1. user_node_links.status  — track active/inactive/pending memberships
--   2. pending_conflicts        — store detected graph inconsistencies
--   3. profiles.role 'moderator' — new role tier between contributor and admin
--   4. RLS updates for moderator (can review claims, cannot edit tree)
--   5. DB-level guard: max 2 biological parents per node (trigger)
--   6. claim_audit_log: extend action CHECK for transfer events
-- ============================================================================

-- ── 1. user_node_links.status ─────────────────────────────────────────────────
ALTER TABLE user_node_links
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'pending'));

-- Index for fast active-link lookups
CREATE INDEX IF NOT EXISTS idx_user_node_links_status
  ON user_node_links(user_id, status) WHERE status = 'active';

-- ── 2. pending_conflicts table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_conflicts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  node_id       UUID REFERENCES family_members(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL CHECK (conflict_type IN (
    'too_many_parents',
    'cycle_detected',
    'birth_year_gap',
    'self_parent',
    'self_spouse',
    'unidirectional_spouse',
    'duplicate_identity',
    'generation_mismatch'
  )),
  description   TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'error')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  detected_by   UUID REFERENCES auth.users(id),
  resolved_by   UUID REFERENCES auth.users(id),
  resolution    TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_conflicts ENABLE ROW LEVEL SECURITY;

-- Family members + admins + moderators can read conflicts for their family
CREATE POLICY "conflicts_family_read"
  ON pending_conflicts FOR SELECT
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND family_id = pending_conflicts.family_id
    )
  );

-- Only admins and moderators can insert/update/delete conflicts
CREATE POLICY "conflicts_admin_mod_write"
  ON pending_conflicts FOR ALL
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'moderator')
    )
  );

-- Index for dashboard conflict queries
CREATE INDEX IF NOT EXISTS idx_pending_conflicts_family_open
  ON pending_conflicts(family_id, status) WHERE status = 'open';

-- ── 3. Moderator role in profiles ────────────────────────────────────────────
-- The existing profiles.role column uses a TEXT type. We update the CHECK
-- constraint to include 'moderator'.
-- Supabase does not allow ALTER TABLE DROP CONSTRAINT when policies reference it,
-- so we use a trigger-based validation instead.
--
-- If a raw CHECK constraint was added before, drop it first:
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Re-add with moderator included
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'moderator', 'contributor', 'viewer'));

-- ── 4. RLS for moderator role ─────────────────────────────────────────────────
-- Moderators can read all family_members in their family (same as contributors)
-- No additional SELECT policy needed — existing family-read policy covers it.

-- Moderators can UPDATE claim_requests (approve/reject) — same as admins but
-- cannot edit tree nodes. The existing "members: admin update all" already
-- restricts UPDATE on family_members to 'admin' only, which correctly excludes
-- moderators from tree edits.

-- Allow moderators to UPDATE claim_requests in their family
DROP POLICY IF EXISTS "claims_admin_update" ON claim_requests;

CREATE POLICY "claims_admin_mod_update"
  ON claim_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      JOIN profiles p ON p.id = auth.uid()
      WHERE fm.id = claim_requests.node_id
        AND fm.family_id = p.family_id
        AND p.role IN ('admin', 'moderator')
    )
  );

-- Allow moderators to SELECT claim_requests for their family
DROP POLICY IF EXISTS "claims_admin_read" ON claim_requests;

CREATE POLICY "claims_admin_mod_read"
  ON claim_requests FOR SELECT
  USING (
    -- Own claim
    claimant_user_id = auth.uid()
    -- OR admin/moderator of the target family
    OR EXISTS (
      SELECT 1 FROM family_members fm
      JOIN profiles p ON p.id = auth.uid()
      WHERE fm.id = claim_requests.node_id
        AND fm.family_id = p.family_id
        AND p.role IN ('admin', 'moderator')
    )
  );

-- Moderators can insert into claim_audit_log
DROP POLICY IF EXISTS "audit_admin_insert" ON claim_audit_log;

CREATE POLICY "audit_admin_mod_insert"
  ON claim_audit_log FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'moderator')
    )
  );

-- ── 5. >2 biological parents guard (DB trigger) ───────────────────────────────
CREATE OR REPLACE FUNCTION check_max_biological_parents()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF array_length(NEW.parent_ids, 1) > 2 THEN
    RAISE EXCEPTION 'A person cannot have more than 2 biological parents (node: %)', NEW.id
      USING ERRCODE = 'check_violation', HINT = 'Use step-parent or adoptive relationships instead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_parents ON family_members;

CREATE TRIGGER trg_max_parents
  BEFORE INSERT OR UPDATE OF parent_ids ON family_members
  FOR EACH ROW EXECUTE FUNCTION check_max_biological_parents();

-- ── 6. Extend claim_audit_log actions to include transfer events ──────────────
ALTER TABLE claim_audit_log DROP CONSTRAINT IF EXISTS claim_audit_log_action_check;

ALTER TABLE claim_audit_log
  ADD CONSTRAINT claim_audit_log_action_check
  CHECK (action IN (
    'claim_initiated','claim_verified','claim_completed','claim_rejected',
    'claim_abandoned','claim_revoked','claim_unclaimed','match_dismissed',
    'invite_sent','invite_expired','invite_refreshed','nodes_merged',
    'guardian_claimed','merge_claim_transfer','claim_transferred'
  ));

-- ── 7. pending_conflicts updated_at trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pending_conflicts_updated_at
  BEFORE UPDATE ON pending_conflicts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
