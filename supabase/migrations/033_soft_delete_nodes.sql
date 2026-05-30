-- Migration 033: Soft delete for family_members
--
-- Hard DELETE is irreversible and dangerous:
--   • Cascades away milestones, voice_notes, claim_requests, audit logs
--   • Severs graph connectivity: parent_ids/spouse_ids on sibling rows reference
--     the deleted UUID — BFS paths through that node break permanently
--   • Cannot be undone without a DB restore
--
-- Fix: replace physical delete with soft delete.
--   • deleted_at / deleted_by columns mark a node as archived
--   • RLS SELECT policy gains AND deleted_at IS NULL → archived nodes invisible
--     to all clients, no app-level filtering needed
--   • Milestones and voice_notes FK changed to ON DELETE SET NULL so memories
--     survive archival (records become orphaned but queryable by family_id)
--   • Sibling rows' parent_ids/spouse_ids LEFT INTACT — graph topology preserved;
--     BFS won't traverse archived nodes because they don't appear in queries
--   • archive_family_member + restore_family_member RPCs for the API routes

-- ── 1. Extend claim_audit_log_action check constraint ────────────────────────
-- Done FIRST so the RPCs below can INSERT with node_archived/node_restored.
ALTER TABLE public.claim_audit_log
  DROP CONSTRAINT IF EXISTS claim_audit_log_action_check;

ALTER TABLE public.claim_audit_log
  ADD CONSTRAINT claim_audit_log_action_check
  CHECK (action IN (
    'claim_initiated','claim_verified','claim_completed','claim_rejected',
    'claim_abandoned','claim_revoked','claim_unclaimed','match_dismissed',
    'invite_sent','invite_expired','invite_refreshed','nodes_merged',
    'guardian_claimed','merge_claim_transfer','claim_transferred',
    'node_archived','node_restored'
  ));

-- ── 2. Soft-delete columns ────────────────────────────────────────────────────
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID        DEFAULT NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.family_members.deleted_at IS
  'NULL = active node. Non-null = archived by admin at this timestamp. Node is never physically deleted.';
COMMENT ON COLUMN public.family_members.deleted_by IS
  'Admin user who archived this node.';

-- ── 3. Partial index for fast active-node queries ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_family_members_active
  ON public.family_members (family_id)
  WHERE deleted_at IS NULL;

-- ── 4. RLS: exclude soft-deleted rows from SELECT ─────────────────────────────
-- Drop every name this SELECT policy has ever had across all migrations
-- (002, 008, 018, 033) so exactly one policy remains after this runs.
DROP POLICY IF EXISTS "Members are viewable by family"               ON public.family_members;
DROP POLICY IF EXISTS "members: family can read"                     ON public.family_members;
DROP POLICY IF EXISTS "members: family members can read"             ON public.family_members;
DROP POLICY IF EXISTS "members: authenticated users can read own family" ON public.family_members;
DROP POLICY IF EXISTS "members: family read"                         ON public.family_members;
DROP POLICY IF EXISTS "members: family read active only"             ON public.family_members;

CREATE POLICY "members: family read active only"
  ON public.family_members FOR SELECT
  USING (
    deleted_at IS NULL
    AND family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ── 4. Protect milestones + voice_notes from cascade ─────────────────────────
ALTER TABLE public.milestones
  DROP CONSTRAINT IF EXISTS milestones_member_id_fkey;
ALTER TABLE public.milestones
  ADD CONSTRAINT milestones_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;

ALTER TABLE public.voice_notes
  DROP CONSTRAINT IF EXISTS voice_notes_member_id_fkey;
ALTER TABLE public.voice_notes
  ADD CONSTRAINT voice_notes_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;

-- ── 5. archive_family_member RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_family_member(
  p_node_id   UUID,
  p_admin_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM public.family_members WHERE id = p_node_id;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'NODE_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND family_id = v_family_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: only family admins can archive nodes';
  END IF;

  -- Soft-delete (idempotent — no-op if already archived)
  UPDATE public.family_members
    SET deleted_at = NOW(), deleted_by = p_admin_id
  WHERE id = p_node_id AND deleted_at IS NULL;

  -- Clear claimer's profile link → dashboard enters node_deleted identity state
  UPDATE public.profiles SET member_id = NULL WHERE member_id = p_node_id;

  -- Audit trail
  INSERT INTO public.claim_audit_log (node_id, family_id, actor_id, action, metadata)
  VALUES (
    p_node_id, v_family_id, p_admin_id, 'node_archived',
    jsonb_build_object('archived_by', p_admin_id, 'archived_at', NOW())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_family_member(UUID, UUID) TO authenticated;

-- ── 6. restore_family_member RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_family_member(
  p_node_id   UUID,
  p_admin_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
BEGIN
  -- Must look up ignoring deleted_at so we can restore it
  SELECT family_id INTO v_family_id
  FROM public.family_members WHERE id = p_node_id;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'NODE_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND family_id = v_family_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: only family admins can restore nodes';
  END IF;

  UPDATE public.family_members
    SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_node_id;

  INSERT INTO public.claim_audit_log (node_id, family_id, actor_id, action, metadata)
  VALUES (
    p_node_id, v_family_id, p_admin_id, 'node_restored',
    jsonb_build_object('restored_by', p_admin_id, 'restored_at', NOW())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_family_member(UUID, UUID) TO authenticated;

-- ── 7. Fix notify_on_claim_audit trigger ─────────────────────────────────────
-- Migration 030 created this trigger with NEW.claim_request_id which is not a
-- column on claim_audit_log — causing every INSERT into the table to fail with
-- "record new has not field claim_request_id".
--
-- This replacement:
--   • Removes the non-existent claim_request_id reference
--   • Returns immediately (no notification) for node_archived / node_restored
--   • Falls back to actor_id for all other actions — preserves existing behavior
CREATE OR REPLACE FUNCTION public.notify_on_claim_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id  UUID;
  v_node_name TEXT;
  v_family_id UUID;
BEGIN
  -- Archive/restore events don't need user-facing notifications
  IF NEW.action IN ('node_archived', 'node_restored') THEN
    RETURN NEW;
  END IF;

  -- Resolve user + node details from the audit row itself
  -- (claim_audit_log has no claim_request_id column)
  SELECT family_id, name INTO v_family_id, v_node_name
    FROM public.family_members WHERE id = NEW.node_id LIMIT 1;

  -- For claim actions the target user is the actor; for revoke it is stored
  -- in the related family_members.claimed_by_user_id at time of revoke —
  -- use actor_id as the best available signal without a join
  v_user_id := NEW.actor_id;

  IF v_user_id IS NULL OR v_family_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.action = 'claim_approved' OR NEW.action = 'claim_completed' THEN
    INSERT INTO public.notifications (user_id, family_id, type, title, body, href, metadata)
    VALUES (
      v_user_id, v_family_id,
      'claim_accepted',
      'Your claim was approved',
      COALESCE('You are now linked to ' || v_node_name || ' in the family tree.',
               'Your profile claim has been approved.'),
      '/dashboard',
      jsonb_build_object('node_id', NEW.node_id)
    );

  ELSIF NEW.action = 'claim_rejected' THEN
    INSERT INTO public.notifications (user_id, family_id, type, title, body, href, metadata)
    VALUES (
      v_user_id, v_family_id,
      'claim_revoked',
      'Your claim was not approved',
      'The family admin reviewed your request. Contact the tree owner for details.',
      '/dashboard',
      jsonb_build_object('node_id', NEW.node_id)
    );

  ELSIF NEW.action IN ('claim_revoked', 'admin_revoke') THEN
    INSERT INTO public.notifications (user_id, family_id, type, title, body, href, metadata)
    VALUES (
      v_user_id, v_family_id,
      'claim_revoked',
      'Your profile link was revoked',
      'A family admin has removed your account link. You may re-claim the node.',
      '/dashboard',
      jsonb_build_object('node_id', NEW.node_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_claim_audit ON public.claim_audit_log;

CREATE TRIGGER trg_notify_on_claim_audit
  AFTER INSERT ON public.claim_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_claim_audit();
