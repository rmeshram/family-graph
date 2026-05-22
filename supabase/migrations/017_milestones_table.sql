-- Migration 017: Dedicated milestones table
-- Replaces the implicit milestones[] on family_members (which never had a column).
-- Milestones are now first-class rows with RLS tied to family membership.

CREATE TABLE IF NOT EXISTS public.milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  title         text NOT NULL,
  year          integer NOT NULL,
  description   text,
  type          text NOT NULL DEFAULT 'other'
                  CHECK (type IN ('birth','marriage','career','education','achievement','relocation','other')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_milestones_member_id ON public.milestones(member_id);
CREATE INDEX IF NOT EXISTS idx_milestones_family_id ON public.milestones(family_id);

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- Family members can read all milestones in their family
CREATE POLICY "milestones_select" ON public.milestones
  FOR SELECT USING (
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Family members (non-viewer) can insert milestones
CREATE POLICY "milestones_insert" ON public.milestones
  FOR INSERT WITH CHECK (
    family_id IN (
      SELECT family_id FROM public.profiles
      WHERE id = auth.uid() AND role != 'viewer'
    )
  );

-- Creator or admin can update/delete
CREATE POLICY "milestones_update" ON public.milestones
  FOR UPDATE USING (
    created_by = auth.uid()
    OR family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "milestones_delete" ON public.milestones
  FOR DELETE USING (
    created_by = auth.uid()
    OR family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
