-- ============================================================
-- Migration 014: Security fixes
--   1. Set voice-notes bucket to private (not public)
--   2. Restrict storage reads to authenticated family members only
--   3. Add role check to events UPDATE policy (viewers were able to edit)
--   4. Add INSERT policy on claim_audit_log so joinWithCode can log claims
--   5. Add missing DB indexes for query performance
-- ============================================================

-- ─── 1. Voice-notes bucket: set private ──────────────────────────────────────
-- The bucket was created as public=true in migration 011, making all audio files
-- accessible without authentication. This sets it back to private.
UPDATE storage.buckets
SET public = false
WHERE id = 'voice-notes';

-- ─── 2. Restrict voice-note reads to authenticated family members ─────────────
-- Drop the broad "Anyone can read" policy from migration 011.
DROP POLICY IF EXISTS "Anyone can read voice notes" ON storage.objects;

-- Scoped read: authenticated users in the same family folder only.
-- Path convention: voice-notes/<family_id>/...
DROP POLICY IF EXISTS "vnote: family read" ON storage.objects;
CREATE POLICY "vnote: family read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voice-notes'
    AND (storage.foldername(name))[1] IN (
      SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ─── 3. Events UPDATE: add role check ────────────────────────────────────────
-- The policy from migration 013 allowed any family member (including viewers)
-- to update event records. Only contributors and admins should be able to write.
DROP POLICY IF EXISTS "events: family update" ON public.events;

CREATE POLICY "events: contrib update"
  ON public.events FOR UPDATE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  )
  WITH CHECK (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  );

-- ─── 4. claim_audit_log INSERT policy ────────────────────────────────────────
-- Previously only SELECT was allowed. The join flow (joinWithCode) now needs to
-- insert claim_completed events so that realtime notifications fire correctly.
-- Only allow inserting for the authenticated user's own family.
DROP POLICY IF EXISTS "audit_family_insert" ON public.claim_audit_log;

CREATE POLICY "audit_family_insert" ON public.claim_audit_log
  FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND family_id = (SELECT family_id FROM public.profiles WHERE id = auth.uid())
  );

-- ─── 5. Missing DB indexes ────────────────────────────────────────────────────
-- These are referenced on hot-path queries: RLS policy lookups, dashboard loads.

-- profiles.family_id: used in every RLS policy via my_family_id() helper
CREATE INDEX IF NOT EXISTS idx_profiles_family_id
  ON public.profiles(family_id);

-- claim_requests.status: used in pending claims polling
CREATE INDEX IF NOT EXISTS idx_claim_requests_status
  ON public.claim_requests(status)
  WHERE status = 'pending';

-- user_node_links.user_id: claimed node lookups
CREATE INDEX IF NOT EXISTS idx_user_node_links_user_id
  ON public.user_node_links(user_id);

-- invite_links.family_id: active links query on invite page
CREATE INDEX IF NOT EXISTS idx_invite_links_family_id
  ON public.invite_links(family_id);

-- invite_links.code: lookup by invite code on join page
CREATE INDEX IF NOT EXISTS idx_invite_links_code
  ON public.invite_links(code);

-- claim_requests.claimant_user_id: individual user's claim history
CREATE INDEX IF NOT EXISTS idx_claim_requests_claimant
  ON public.claim_requests(claimant_user_id);
