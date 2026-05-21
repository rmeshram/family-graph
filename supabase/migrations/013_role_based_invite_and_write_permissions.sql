-- Migration 013: enforce viewer/contributor/admin roles for writes and invite creation
--
-- Current gaps:
--   - any family member can create invite links, including admin invites
--   - viewer vs contributor is mostly cosmetic because write policies are family-wide
--
-- This migration tightens RLS so:
--   - viewers are read-only
--   - contributors can create/update core family content
--   - only admins can create admin invite links

-- ─── family_members ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "members: contrib can insert" ON public.family_members;
DROP POLICY IF EXISTS "members: contrib can update" ON public.family_members;

CREATE POLICY "members: contrib can insert"
  ON public.family_members FOR INSERT
  WITH CHECK (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  );

CREATE POLICY "members: contrib can update"
  ON public.family_members FOR UPDATE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  )
  WITH CHECK (family_id = public.my_family_id());

-- ─── stories ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "stories: family" ON public.stories;

CREATE POLICY "stories: family read"
  ON public.stories FOR SELECT
  USING (family_id = public.my_family_id());

CREATE POLICY "stories: contrib write"
  ON public.stories FOR INSERT
  WITH CHECK (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  );

CREATE POLICY "stories: contrib update"
  ON public.stories FOR UPDATE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  )
  WITH CHECK (family_id = public.my_family_id());

CREATE POLICY "stories: contrib delete"
  ON public.stories FOR DELETE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  );

-- ─── memories ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "memories: family" ON public.memories;

CREATE POLICY "memories: family read"
  ON public.memories FOR SELECT
  USING (family_id = public.my_family_id());

CREATE POLICY "memories: contrib insert"
  ON public.memories FOR INSERT
  WITH CHECK (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  );

CREATE POLICY "memories: contrib update"
  ON public.memories FOR UPDATE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  )
  WITH CHECK (family_id = public.my_family_id());

CREATE POLICY "memories: contrib delete"
  ON public.memories FOR DELETE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  );

-- ─── events ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events: family" ON public.events;

CREATE POLICY "events: family read"
  ON public.events FOR SELECT
  USING (family_id = public.my_family_id());

CREATE POLICY "events: contrib insert"
  ON public.events FOR INSERT
  WITH CHECK (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  );

CREATE POLICY "events: family update"
  ON public.events FOR UPDATE
  USING (family_id = public.my_family_id())
  WITH CHECK (family_id = public.my_family_id());

CREATE POLICY "events: contrib delete"
  ON public.events FOR DELETE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
  );

-- ─── invite_links ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invites: family can manage" ON public.invite_links;

CREATE POLICY "invites: family read"
  ON public.invite_links FOR SELECT
  USING (family_id = public.my_family_id());

CREATE POLICY "invites: contrib create"
  ON public.invite_links FOR INSERT
  WITH CHECK (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
    AND (
      role <> 'admin'
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
      )
    )
  );

CREATE POLICY "invites: manage own family"
  ON public.invite_links FOR UPDATE
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
    AND (
      role <> 'admin'
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
      )
    )
  );

CREATE POLICY "invites: delete own family"
  ON public.invite_links FOR DELETE
  USING (
    family_id = public.my_family_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'contributor')
    )
    AND (
      role <> 'admin'
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
      )
    )
  );
