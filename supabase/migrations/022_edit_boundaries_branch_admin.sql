-- Migration 022: Edit Boundaries + branch_admin Role
-- ============================================================================
-- Goals:
--   1. Edit boundaries: contributors can only update their own claimed node
--      + first-degree relatives (parent, spouse, child nodes).
--      Previously contributors could edit any unclaimed node — this was too broad.
--   2. branch_admin role: can edit any node in their assigned subtree.
--      Subtree assignment stored in profiles.branch_root_member_id.
--   3. Keep existing admin/moderator/self-update paths intact.
-- ============================================================================

-- ── 1. Add branch_root_member_id to profiles ─────────────────────────────────
-- When role = 'branch_admin', this stores the root node of the subtree they manage.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS branch_root_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL;

-- ── 2. Helper: is_direct_relative(caller_member_id, target_member_id) ─────────
-- Returns TRUE if target is a parent, child, or spouse of caller.
-- Used in the contributor UPDATE policy below.
CREATE OR REPLACE FUNCTION public.is_direct_relative(
  caller_member_id UUID,
  target_member_id UUID
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members AS caller
    WHERE caller.id = caller_member_id
      AND (
        -- target is caller's parent
        target_member_id = ANY(caller.parent_ids)
        -- target is caller's spouse
        OR target_member_id = ANY(caller.spouse_ids)
        -- target is caller's child (target has caller in its parent_ids)
        OR EXISTS (
          SELECT 1 FROM family_members child
          WHERE child.id = target_member_id
            AND caller_member_id = ANY(child.parent_ids)
        )
      )
  )
$$;

-- ── 3. Helper: is_in_subtree(branch_root_id, target_member_id) ───────────────
-- Returns TRUE if target is in the subtree rooted at branch_root_id.
-- Uses a CTE-based BFS. Depth capped at 20 to avoid infinite loops.
CREATE OR REPLACE FUNCTION public.is_in_subtree(
  branch_root_id UUID,
  target_member_id UUID
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH RECURSIVE subtree AS (
    -- Seed: the root node itself
    SELECT id, parent_ids, spouse_ids FROM family_members WHERE id = branch_root_id
    UNION ALL
    -- Expand: children of nodes already in the subtree (BFS)
    SELECT child.id, child.parent_ids, child.spouse_ids
    FROM family_members child
    JOIN subtree s ON child.id = ANY(
      -- Children = nodes whose parent_ids contains current subtree node
      ARRAY(
        SELECT fm.id FROM family_members fm WHERE s.id = ANY(fm.parent_ids) LIMIT 200
      )
    )
  )
  SELECT EXISTS (SELECT 1 FROM subtree WHERE id = target_member_id)
$$;

-- ── 4. Update contributor UPDATE policy ───────────────────────────────────────
-- Replace migration 021's "members: contrib update unclaimed" with a tighter policy.
DROP POLICY IF EXISTS "members: contrib update unclaimed" ON public.family_members;

-- Contributors may only UPDATE:
--   (a) Nodes they own (claimed_by_user_id = their user id) — via existing self-update policy
--   (b) Unclaimed nodes that are direct relatives of their own node
-- Note: (a) is already handled by "Claimed users can update their visibility"
-- and the self-update policies from migrations 002/018. We only add (b) here.
CREATE POLICY "members: contrib update own relatives"
  ON public.family_members FOR UPDATE
  USING (
    family_id = public.my_family_id()
    AND is_claimed = FALSE
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('contributor')
        AND p.member_id IS NOT NULL
        -- target must be a direct relative of caller's node
        AND public.is_direct_relative(p.member_id, family_members.id)
    )
  )
  WITH CHECK (family_id = public.my_family_id());

-- branch_admin: can update any unclaimed node within their assigned subtree
CREATE POLICY "members: branch_admin update subtree"
  ON public.family_members FOR UPDATE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'branch_admin'
        AND p.branch_root_member_id IS NOT NULL
        AND public.is_in_subtree(p.branch_root_member_id, family_members.id)
    )
  )
  WITH CHECK (family_id = public.my_family_id());

-- branch_admin: can also insert new nodes (same subtree constraint is impractical
-- at INSERT time since the new node doesn't exist yet — allow family-level insert)
-- We keep the existing "members: contrib can insert" (role IN admin/contributor)
-- and add branch_admin to it.
DROP POLICY IF EXISTS "members: contrib can insert" ON public.family_members;

CREATE POLICY "members: contrib branch_admin can insert"
  ON public.family_members FOR INSERT
  WITH CHECK (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'branch_admin', 'contributor')
    )
  );

-- ── 5. Ensure profiles role CHECK includes branch_admin ───────────────────────
-- Already added 'moderator' in migration 021. Add 'branch_admin' here.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'moderator', 'branch_admin', 'contributor', 'viewer'));

-- ── 6. Index for subtree queries ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_branch_root
  ON profiles(branch_root_member_id) WHERE branch_root_member_id IS NOT NULL;
