-- Migration 008: Fix infinite recursion in family_members SELECT policy
-- The previous policy (migration 002) queried family_members inside its own
-- USING clause → 42P17 infinite recursion. Use profiles table instead.

DROP POLICY IF EXISTS "Members are viewable by family" ON family_members;

CREATE POLICY "Members are viewable by family"
  ON family_members FOR SELECT
  USING (
    -- User belongs to this family (looked up via profiles — no recursion)
    family_id = (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    )
    AND (
      -- Family/public members visible to all family members
      visibility IN ('public', 'family')
      -- Private members only visible to their claimer
      OR claimed_by_user_id = auth.uid()
      -- Family creator sees everything regardless of visibility
      OR family_id IN (
        SELECT id FROM public.families WHERE created_by = auth.uid()
      )
    )
  );
