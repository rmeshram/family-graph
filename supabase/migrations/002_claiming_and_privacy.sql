-- Migration 002: User claiming and privacy visibility
-- Each family member can be "claimed" by a registered user, and can have a visibility level.

-- Claiming columns
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN NOT NULL DEFAULT FALSE;

-- Privacy column
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'family'
    CHECK (visibility IN ('public', 'family', 'private'));

-- Index for fast lookup of a user's claimed node
CREATE INDEX IF NOT EXISTS idx_family_members_claimed_by
  ON family_members(claimed_by_user_id)
  WHERE claimed_by_user_id IS NOT NULL;

-- RLS: private members are only visible to the person who claimed them
-- (existing family-level SELECT policy already covers 'family' and 'public')
-- We refine the existing select policy instead of adding a conflicting one.
DROP POLICY IF EXISTS "Members are viewable by family" ON family_members;

CREATE POLICY "Members are viewable by family"
  ON family_members FOR SELECT
  USING (
    -- family_id owner always sees everything
    family_id IN (
      SELECT id FROM families WHERE created_by = auth.uid()
    )
    OR
    -- family members can see public/family nodes
    (
      visibility IN ('public', 'family')
      AND family_id IN (
        SELECT family_id FROM family_members
        WHERE claimed_by_user_id = auth.uid()
      )
    )
    OR
    -- private node — only visible to its claimer
    (
      visibility = 'private'
      AND claimed_by_user_id = auth.uid()
    )
  );

-- Allow users to claim an unclaimed member
CREATE POLICY IF NOT EXISTS "Users can claim unclaimed members"
  ON family_members FOR UPDATE
  USING (
    is_claimed = FALSE
    AND family_id IN (
      SELECT family_id FROM family_members
      WHERE claimed_by_user_id = auth.uid()
      UNION
      SELECT id FROM families WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    claimed_by_user_id = auth.uid()
    AND is_claimed = TRUE
  );

-- Allow claimed users to update their own visibility
CREATE POLICY IF NOT EXISTS "Claimed users can update their visibility"
  ON family_members FOR UPDATE
  USING (claimed_by_user_id = auth.uid())
  WITH CHECK (claimed_by_user_id = auth.uid());
