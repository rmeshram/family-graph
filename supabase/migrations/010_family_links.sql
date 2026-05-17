-- Migration 011: Cross-Family Linking ("Small World" growth engine)
-- Enables mutual opt-in tree linking so families can see each other's members.
-- Renamed from 010 to avoid collision with 010_fix_invite_rls.sql.
-- Requires: 001_initial_schema.sql (my_family_id function, families, family_members, profiles)

-- ─── family_links ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.family_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_a_id       UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  family_b_id       UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','revoked')),
  junction_member_a UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  junction_member_b UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  initiated_by      UUID NOT NULL REFERENCES auth.users(id),
  accepted_by       UUID REFERENCES auth.users(id),
  link_note         TEXT,
  visibility_scope  TEXT NOT NULL DEFAULT 'names_only'
    CHECK (visibility_scope IN ('names_only','full_profile','admin_only')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Normalise UUID order so (A,B) and (B,A) can't both exist
  CONSTRAINT family_links_ordered   CHECK (family_a_id < family_b_id),
  UNIQUE (family_a_id, family_b_id)
);

ALTER TABLE public.family_links ENABLE ROW LEVEL SECURITY;

-- Anyone in either family can see the link
CREATE POLICY "family_links: read" ON public.family_links FOR SELECT USING (
  family_a_id = public.my_family_id() OR family_b_id = public.my_family_id()
);

-- Only the initiating family can insert (family_a must equal the caller's family)
CREATE POLICY "family_links: insert" ON public.family_links FOR INSERT WITH CHECK (
  family_a_id = public.my_family_id()
);

-- Only admins in either family can update (accept / revoke)
CREATE POLICY "family_links: admin update" ON public.family_links FOR UPDATE USING (
  (family_a_id = public.my_family_id() OR family_b_id = public.my_family_id())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─── cross_family_node_matches ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cross_family_node_matches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_a_id        UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  node_b_id        UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  family_a_id      UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  family_b_id      UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  confidence_score INT CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_tier  TEXT CHECK (confidence_tier IN ('high','medium','low')),
  match_reasons    TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','confirmed','rejected','merged')),
  reviewed_by      UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (node_a_id, node_b_id)
);

ALTER TABLE public.cross_family_node_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cross_family_node_matches: read" ON public.cross_family_node_matches FOR SELECT USING (
  family_a_id = public.my_family_id() OR family_b_id = public.my_family_id()
);

-- ─── family_link_notifications ───────────────────────────────────────────────
-- Written by the service-role backend; read by the recipient family.
CREATE TABLE IF NOT EXISTS public.family_link_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  source_family_id    UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  new_member_id       UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  link_id             UUID NOT NULL REFERENCES public.family_links(id) ON DELETE CASCADE,
  seen_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.family_link_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_link_notifications: read" ON public.family_link_notifications FOR SELECT USING (
  recipient_family_id = public.my_family_id()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fl_family_a   ON public.family_links(family_a_id, status);
CREATE INDEX IF NOT EXISTS idx_fl_family_b   ON public.family_links(family_b_id, status);
CREATE INDEX IF NOT EXISTS idx_fln_recipient ON public.family_link_notifications(recipient_family_id, seen_at);
CREATE INDEX IF NOT EXISTS idx_cfnm_families ON public.cross_family_node_matches(family_a_id, family_b_id, status);

