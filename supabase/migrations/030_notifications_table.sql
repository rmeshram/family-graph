-- Migration 030: Persistent notifications table
--
-- Stores server-generated notifications so they survive page reloads and
-- are visible on every device. The client hook reads from this table and
-- overlays ephemeral client-side notifications (birthdays, events) on top.
--
-- Populated by:
--   - API routes: /api/nodes/[id]/claim, /api/nodes/[id]/revoke-claim,
--                 /api/claims/[id]/review
--   - A trigger on claim_audit_log (see below) for any future actions.

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id   UUID        REFERENCES public.families(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  href        TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the primary query patterns
CREATE INDEX IF NOT EXISTS notifications_user_id_idx     ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_family_id_idx   ON public.notifications (family_id) WHERE family_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_unread_idx      ON public.notifications (user_id) WHERE read_at IS NULL;

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications.
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can mark their own notifications as read.
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only the service-role (API routes) may insert notifications.
-- Row-level INSERT is blocked for regular users; the API uses the admin client.
CREATE POLICY "Service role inserts notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (false);  -- blocked for all anon/authenticated roles; service-role bypasses RLS

-- ── Trigger: auto-notify on claim_audit_log events ────────────────────────────
--
-- When an admin approves or rejects a claim, write a notification row for the
-- claimant so they are informed even if they're not online at that moment.

CREATE OR REPLACE FUNCTION public.notify_on_claim_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_node_name TEXT;
  v_family_id UUID;
BEGIN
  -- Resolve the claimant's user_id from the claim_request referenced in the audit row
  IF NEW.claim_request_id IS NOT NULL THEN
    SELECT cr.claimant_user_id, fm.family_id, fm.name
      INTO v_user_id, v_family_id, v_node_name
      FROM public.claim_requests cr
      JOIN public.family_members fm ON fm.id = cr.node_id
     WHERE cr.id = NEW.claim_request_id
     LIMIT 1;
  ELSE
    -- Fall back: audit row has an actor_id; for revoke actions the actor is the target
    v_user_id := NEW.actor_id;
    SELECT family_id, name INTO v_family_id, v_node_name
      FROM public.family_members WHERE id = NEW.node_id LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.action = 'claim_approved' THEN
    INSERT INTO public.notifications (user_id, family_id, type, title, body, href, metadata)
    VALUES (
      v_user_id, v_family_id,
      'claim_accepted',
      'Your claim was approved',
      COALESCE('You are now linked to ' || v_node_name || ' in the family tree.', 'Your profile claim has been approved.'),
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

  ELSIF NEW.action = 'claim_revoked' OR NEW.action = 'admin_revoke' THEN
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

-- Drop if already exists to allow re-running migrations idempotently
DROP TRIGGER IF EXISTS trg_notify_on_claim_audit ON public.claim_audit_log;

CREATE TRIGGER trg_notify_on_claim_audit
  AFTER INSERT ON public.claim_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_claim_audit();
