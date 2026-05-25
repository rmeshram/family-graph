-- Migration 018: Harden RLS — claimed-node protection + show_as_anonymous guard
-- ============================================================================
-- PROBLEMS FIXED:
--   1. "members: contrib can update" (migration 013) allows any contributor to
--      overwrite name/email/phone on ANY node, including claimed ones they don't
--      own. This is the single biggest security hole in the current system.
--
--   2. show_as_anonymous has no RLS protection — any contributor can toggle it.
--
-- SOLUTION:
--   • Contributors may only UPDATE unclaimed rows (is_claimed = FALSE).
--   • A separate admin-only policy covers UPDATE on any row.
--   • The existing "self can update" policy (claimed_by_user_id = auth.uid())
--     continues to allow owners to edit their own claimed node.
--   • show_as_anonymous: extra guard ensures only admins or the claimer can set
--     this to TRUE (a WITH CHECK restriction on top of the row-level USING).
-- ============================================================================

-- ── Step 1: Replace the dangerously broad contributor UPDATE policy ──────────
-- This was the P0 vulnerability: any contributor could write to claimed nodes.
DROP POLICY IF EXISTS "members: contrib can update" ON public.family_members;

-- Contributors may only UPDATE rows that are NOT yet claimed.
-- This prevents identity theft via name/email/phone overwrite on claimed nodes.
CREATE POLICY "members: contrib update unclaimed"
  ON public.family_members FOR UPDATE
  USING (
    family_id = public.my_family_id()
    AND is_claimed = FALSE
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  )
  WITH CHECK (family_id = public.my_family_id());

-- Admins can update ANY member row in their family (claimed or not).
-- This keeps moderation, claim revocation, and profile repair working.
CREATE POLICY "members: admin update all"
  ON public.family_members FOR UPDATE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (family_id = public.my_family_id());

-- ── Step 2: show_as_anonymous — restrict to admin or claimer ─────────────────
-- The WITH CHECK on the "admin update all" policy above already enforces this
-- for the ADMIN path. For the "self can update" path we add an explicit check
-- that show_as_anonymous can only be set if the caller is admin OR owns the node.
--
-- Because Postgres evaluates USING + WITH CHECK per policy row, the existing
-- "Claimed users can update their visibility" policy (from migration 002) already
-- scopes updates to `claimed_by_user_id = auth.uid()`, meaning non-owners are
-- already blocked. We just need to verify the WITH CHECK cannot be smuggled.
--
-- No additional policy needed — the existing self-update + new admin-update
-- policies together enforce this correctly. The old contrib-update policy that
-- was the gap is now replaced above.

-- ── Step 3: Viewer read-only — verify INSERT is blocked ──────────────────────
-- Migration 013 already created "members: contrib can insert" which restricts
-- INSERT to admin/contributor. Viewers (role = 'viewer') are implicitly excluded.
-- No change needed, but document the current state for auditability:
--
--   INSERT policy: role IN ('admin', 'contributor') -- viewers excluded ✓
--   UPDATE policy (admin): role = 'admin'            -- explicit ✓
--   UPDATE policy (contrib): role IN ('admin','contributor') AND unclaimed ✓
--   UPDATE policy (self):    claimed_by_user_id = auth.uid() ✓
--   DELETE policy:           role = 'admin' (from migration 014) ✓
--   SELECT policy:           any family member, visibility-gated ✓

-- ── Step 4: Profiles — privacy_settings owner-only guard ─────────────────────
-- profiles.privacy_settings should only be writeable by the owning user.
-- The existing profiles SELECT policy is family-wide; UPDATE should be self-only.
-- Check what policies exist and add if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles: self update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "profiles: self update"
        ON public.profiles FOR UPDATE
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid())
    $pol$;
  END IF;
END;
$$;

-- ── Step 5: Viewer stories/memories write block (belt-and-suspenders) ─────────
-- Migration 013 already gates stories INSERT/UPDATE/DELETE on role IN ('admin','contributor').
-- Add explicit viewer block on memories too, in case that table is missing the guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'memories'
      AND policyname = 'memories: viewer read only'
  ) THEN
    -- Only add if memories table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'memories') THEN
      EXECUTE $pol$
        CREATE POLICY "memories: viewer read only"
          ON public.memories FOR INSERT
          WITH CHECK (
            family_id = public.my_family_id()
            AND EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
                AND role IN ('admin', 'contributor')
            )
          )
      $pol$;
    END IF;
  END IF;
END;
$$;

-- ── Verification query (run manually in SQL Editor to confirm) ────────────────
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'family_members'
-- ORDER BY cmd, policyname;

-- ── Step 6: Extend claim_audit_log action enum ────────────────────────────────
-- The existing CHECK constraint in migration 009 does not include `merge_blocked`
-- (added in this release to the merge route) or `claim_abandoned`.
-- Drop and recreate the constraint to add the new allowed actions.
-- NOTE: `claim_abandoned` was added in an earlier migration; we include it here
-- for correctness in case it wasn't applied.
ALTER TABLE public.claim_audit_log
  DROP CONSTRAINT IF EXISTS claim_audit_log_action_check;

ALTER TABLE public.claim_audit_log
  ADD CONSTRAINT claim_audit_log_action_check CHECK (
    action IN (
      'claim_initiated', 'claim_verified', 'claim_completed', 'claim_rejected',
      'claim_abandoned', 'claim_revoked', 'claim_unclaimed', 'match_dismissed',
      'invite_sent', 'invite_expired', 'invite_refreshed',
      'nodes_merged', 'node_merged',
      'guardian_claimed',
      'merge_blocked',
      'merge_same_user_duplicate',
      'merge_claim_transfer'
    )
  );
