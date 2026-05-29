-- Migration 027: Harden contributor UPDATE policy — add is_claimed = FALSE to WITH CHECK
-- ============================================================================
-- PROBLEM (Bug #9):
--   Migration 018 added "members: contrib update unclaimed" which correctly
--   restricts contributors to updating only unclaimed rows via USING:
--
--     USING (family_id = my_family_id() AND is_claimed = FALSE AND ...)
--
--   However the WITH CHECK clause only validated `family_id`:
--
--     WITH CHECK (family_id = my_family_id())
--
--   In Postgres, USING evaluates against the OLD row and WITH CHECK evaluates
--   against the NEW row being written. Omitting `is_claimed = FALSE` from
--   WITH CHECK means a contributor UPDATE that includes setting is_claimed=TRUE
--   (e.g. via a crafted payload) would pass WITH CHECK even though it shouldn't.
--   It also means in concurrent scenarios the written row is not re-validated as
--   unclaimed, leaving a narrow window for claim state to be inconsistently set.
--
-- FIX:
--   Drop and recreate the contributor UPDATE policy with is_claimed = FALSE
--   added to the WITH CHECK clause so the new row state is always validated.
-- ============================================================================

-- Drop the policy installed by migration 018
DROP POLICY IF EXISTS "members: contrib update unclaimed" ON public.family_members;

-- Recreate with is_claimed = FALSE in both USING (old row) and WITH CHECK (new row)
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
  WITH CHECK (
    family_id = public.my_family_id()
    AND is_claimed = FALSE
  );
