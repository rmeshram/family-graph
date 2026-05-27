-- ═══════════════════════════════════════════════════════════════════════════
-- FAMILY GRAPH — FULL DATABASE SETUP (all migrations 001-009 consolidated)
-- Run this in Supabase SQL Editor → New Query → Run All
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── families ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.families (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS privacy_mode TEXT
    CHECK (privacy_mode IN ('open', 'protected', 'closed'))
    DEFAULT 'protected';

-- ─── profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id    UUID REFERENCES public.families(id) ON DELETE SET NULL,
  member_id    UUID,
  display_name TEXT,
  avatar_url   TEXT,
  phone        TEXT,
  role         TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','contributor','viewer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── family_members ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.family_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  birth_year            INTEGER,
  death_year            INTEGER,
  birth_place           TEXT,
  current_place         TEXT,
  photo_url             TEXT,
  bio                   TEXT,
  relationship          TEXT,
  occupation            TEXT,
  parent_ids            UUID[] NOT NULL DEFAULT '{}',
  spouse_ids            UUID[] NOT NULL DEFAULT '{}',
  generation            INTEGER NOT NULL DEFAULT 0,
  is_alive              BOOLEAN NOT NULL DEFAULT TRUE,
  gender                TEXT CHECK (gender IN ('male','female','other')),
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  side                  TEXT CHECK (side IN ('paternal','maternal','both','spouse')),
  role                  TEXT CHECK (role IN ('admin','contributor','viewer')),
  gotra                 TEXT,
  caste                 TEXT,
  hometown              TEXT,
  native_language       TEXT,
  religion              TEXT,
  phone                 TEXT,
  email                 TEXT,
  added_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 002: claiming & privacy
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_claimed         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS visibility         TEXT NOT NULL DEFAULT 'family'
    CHECK (visibility IN ('public', 'family', 'private'));

-- Migration 003: extended / affiliated network
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS network_group          TEXT NOT NULL DEFAULT 'core'
    CHECK (network_group IN ('core', 'extended', 'affiliated')),
  ADD COLUMN IF NOT EXISTS affiliated_family_id   TEXT,
  ADD COLUMN IF NOT EXISTS affiliated_family_name TEXT,
  ADD COLUMN IF NOT EXISTS affiliated_junction_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL;

-- Migration 005: birthday fields
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS birth_month SMALLINT CHECK (birth_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS birth_day   SMALLINT CHECK (birth_day   BETWEEN 1 AND 31);

-- Migration 006: instagram handle
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT;

-- FK: profiles.member_id → family_members.id
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_member_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;

-- ─── stories ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  date         DATE,
  author       TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  language     TEXT DEFAULT 'en',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── memories ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.memories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  photo_url         TEXT,
  event_type        TEXT NOT NULL DEFAULT 'other'
    CHECK (event_type IN ('wedding','birth','festival','graduation','travel','family-gathering','other')),
  year              INTEGER,
  date              DATE,
  tagged_member_ids UUID[] NOT NULL DEFAULT '{}',
  uploaded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── voice_notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voice_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id        UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  file_url         TEXT,
  transcription    TEXT,
  translation      TEXT,
  language         TEXT DEFAULT 'hi',
  recorded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── events ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  event_date  TIMESTAMPTZ NOT NULL,
  location    TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rsvps       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── invite_links ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invite_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('admin','contributor','viewer')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  used_count INTEGER NOT NULL DEFAULT 0,
  max_uses   INTEGER,
  birth_year_hint INTEGER CHECK (birth_year_hint IS NULL OR (birth_year_hint >= 1800 AND birth_year_hint <= 2200)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_family_members_family_id       ON public.family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_claimed_by      ON public.family_members(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_family_members_network_group   ON public.family_members(network_group);
CREATE INDEX IF NOT EXISTS idx_family_members_affiliated      ON public.family_members(affiliated_family_id) WHERE affiliated_family_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stories_member_id              ON public.stories(member_id);
CREATE INDEX IF NOT EXISTS idx_memories_family_id             ON public.memories(family_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_member_id          ON public.voice_notes(member_id);
CREATE INDEX IF NOT EXISTS idx_events_family_id               ON public.events(family_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_code              ON public.invite_links(code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_node_links_one_primary_per_user ON public.user_node_links(user_id) WHERE is_primary = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.families       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_links   ENABLE ROW LEVEL SECURITY;

-- ─── Helper function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_family_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT family_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── families policies ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "families: members can read"   ON public.families;
DROP POLICY IF EXISTS "families: creator can update" ON public.families;
DROP POLICY IF EXISTS "families: creator can insert" ON public.families;
CREATE POLICY "families: members can read"   ON public.families FOR SELECT USING (id = public.my_family_id());
CREATE POLICY "families: creator can update" ON public.families FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "families: creator can insert" ON public.families FOR INSERT WITH CHECK (created_by = auth.uid());

-- ─── profiles policies ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles: own row"     ON public.profiles;
DROP POLICY IF EXISTS "profiles: family read" ON public.profiles;
CREATE POLICY "profiles: own row"     ON public.profiles FOR ALL    USING (id = auth.uid());
CREATE POLICY "profiles: family read" ON public.profiles FOR SELECT USING (family_id = public.my_family_id());

-- ─── family_members policies (008: non-recursive fix) ────────────────────────
-- Drop ALL previous versions of this policy
DROP POLICY IF EXISTS "Members are viewable by family"    ON public.family_members;
DROP POLICY IF EXISTS "members: family can read"          ON public.family_members;
DROP POLICY IF EXISTS "members: contrib can insert"       ON public.family_members;
DROP POLICY IF EXISTS "members: contrib can update"       ON public.family_members;
DROP POLICY IF EXISTS "members: admin can delete"         ON public.family_members;
DROP POLICY IF EXISTS "Users can claim unclaimed members" ON public.family_members;
DROP POLICY IF EXISTS "Claimed users can update their visibility" ON public.family_members;

-- SELECT: look up family via profiles (no self-reference → no recursion)
CREATE POLICY "members: family can read"
  ON public.family_members FOR SELECT
  USING (
    family_id = (SELECT family_id FROM public.profiles WHERE id = auth.uid())
    AND (
      visibility IN ('public', 'family')
      OR claimed_by_user_id = auth.uid()
      OR family_id IN (SELECT id FROM public.families WHERE created_by = auth.uid())
    )
  );

CREATE POLICY "members: contrib can insert"
  ON public.family_members FOR INSERT
  WITH CHECK (family_id = public.my_family_id());

CREATE POLICY "members: contrib can update"
  ON public.family_members FOR UPDATE
  USING (family_id = public.my_family_id());

CREATE POLICY "members: admin can delete"
  ON public.family_members FOR DELETE
  USING (
    family_id = public.my_family_id()
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      OR EXISTS (SELECT 1 FROM public.families WHERE id = family_id AND created_by = auth.uid())
    )
  );

-- ─── stories, memories, voice_notes, events, invite_links ────────────────────
DROP POLICY IF EXISTS "stories: family"          ON public.stories;
DROP POLICY IF EXISTS "memories: family"         ON public.memories;
DROP POLICY IF EXISTS "memories: family select"  ON public.memories;
DROP POLICY IF EXISTS "memories: family insert"  ON public.memories;
DROP POLICY IF EXISTS "memories: family update"  ON public.memories;
DROP POLICY IF EXISTS "memories: family delete"  ON public.memories;
DROP POLICY IF EXISTS "vnotes: family"           ON public.voice_notes;
DROP POLICY IF EXISTS "vnotes: family select"    ON public.voice_notes;
DROP POLICY IF EXISTS "vnotes: family insert"    ON public.voice_notes;
DROP POLICY IF EXISTS "vnotes: family update"    ON public.voice_notes;
DROP POLICY IF EXISTS "vnotes: family delete"    ON public.voice_notes;
DROP POLICY IF EXISTS "events: family"           ON public.events;
DROP POLICY IF EXISTS "invites: family"          ON public.invite_links;
DROP POLICY IF EXISTS "invites: family can manage" ON public.invite_links;
DROP POLICY IF EXISTS "invites: public can read"   ON public.invite_links;

CREATE POLICY "stories: family"   ON public.stories     FOR ALL USING (family_id = public.my_family_id());
CREATE POLICY "events: family"    ON public.events       FOR ALL USING (family_id = public.my_family_id());
CREATE POLICY "invites: family can manage" ON public.invite_links FOR ALL    USING (family_id = public.my_family_id());
CREATE POLICY "invites: public can read"   ON public.invite_links FOR SELECT USING (true);

-- memories — explicit per-operation policies (reliable INSERT WITH CHECK)
CREATE POLICY "memories: family select" ON public.memories FOR SELECT USING     (family_id = public.my_family_id());
CREATE POLICY "memories: family insert" ON public.memories FOR INSERT WITH CHECK(family_id = public.my_family_id());
CREATE POLICY "memories: family update" ON public.memories FOR UPDATE USING     (family_id = public.my_family_id()) WITH CHECK (family_id = public.my_family_id());
CREATE POLICY "memories: family delete" ON public.memories FOR DELETE USING     (family_id = public.my_family_id());

-- voice_notes — explicit per-operation policies
CREATE POLICY "vnotes: family select" ON public.voice_notes FOR SELECT USING     (family_id = public.my_family_id());
CREATE POLICY "vnotes: family insert" ON public.voice_notes FOR INSERT WITH CHECK(family_id = public.my_family_id());
CREATE POLICY "vnotes: family update" ON public.voice_notes FOR UPDATE USING     (family_id = public.my_family_id()) WITH CHECK (family_id = public.my_family_id());
CREATE POLICY "vnotes: family delete" ON public.voice_notes FOR DELETE USING     (family_id = public.my_family_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-create profile row on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.phone,
    'viewer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER RPC: create_family (bypasses RLS for onboarding)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_family(
  p_name        TEXT,
  p_invite_code TEXT
)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_user_id   UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.families WHERE invite_code = p_invite_code) THEN
    RAISE EXCEPTION 'Invite code already in use';
  END IF;

  INSERT INTO public.families (name, invite_code, created_by)
  VALUES (p_name, p_invite_code, v_user_id)
  RETURNING id INTO v_family_id;

  RETURN json_build_object('id', v_family_id, 'invite_code', p_invite_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_family(TEXT, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS + POLICIES
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('memories', 'memories', TRUE, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('members',  'members',  TRUE,  5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('avatars',  'avatars',  TRUE,  5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('family-photos', 'family-photos', TRUE, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('voice-notes',   'voice-notes',   FALSE, 26214400, ARRAY['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Family members can upload memories"    ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read memories"              ON storage.objects;
DROP POLICY IF EXISTS "Family members can upload member photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read member photos"         ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar"           ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar"           ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read avatars"               ON storage.objects;
DROP POLICY IF EXISTS "photos: family read"                   ON storage.objects;
DROP POLICY IF EXISTS "photos: family insert"                 ON storage.objects;
DROP POLICY IF EXISTS "vnote: family read"                    ON storage.objects;
DROP POLICY IF EXISTS "vnote: family insert"                  ON storage.objects;

CREATE POLICY "Family members can upload memories"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'memories' AND
    (storage.foldername(name))[1] IN (SELECT family_id::TEXT FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Anyone can read memories"
  ON storage.objects FOR SELECT TO public USING (bucket_id = 'memories');

CREATE POLICY "Family members can upload member photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'members' AND
    (storage.foldername(name))[1] IN (SELECT family_id::TEXT FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Anyone can read member photos"
  ON storage.objects FOR SELECT TO public USING (bucket_id = 'members');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Anyone can read avatars"
  ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');

CREATE POLICY "photos: family read"
  ON storage.objects FOR SELECT USING (bucket_id = 'family-photos');
CREATE POLICY "photos: family insert"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'family-photos' AND auth.role() = 'authenticated');
CREATE POLICY "vnote: family read"
  ON storage.objects FOR SELECT USING (bucket_id = 'voice-notes' AND auth.role() = 'authenticated');
CREATE POLICY "vnote: family insert"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'voice-notes' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Family members can delete memories"    ON storage.objects;
DROP POLICY IF EXISTS "Family members can update memories"    ON storage.objects;
DROP POLICY IF EXISTS "Family members can delete voice notes" ON storage.objects;

CREATE POLICY "Family members can delete memories"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'memories' AND
    (storage.foldername(name))[1] IN (SELECT family_id::TEXT FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Family members can update memories"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'memories' AND
    (storage.foldername(name))[1] IN (SELECT family_id::TEXT FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Family members can delete voice notes"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'voice-notes' AND
    (storage.foldername(name))[1] IN (SELECT family_id::TEXT FROM public.profiles WHERE id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009: claim trigger + update policy for claimed users
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow claimed users to update their own member row (not just admins)
DROP POLICY IF EXISTS "members: self can update" ON public.family_members;
CREATE POLICY "members: self can update"
  ON public.family_members FOR UPDATE
  USING (claimed_by_user_id = auth.uid());

-- Trigger: when a member is claimed, link profiles.member_id automatically
CREATE OR REPLACE FUNCTION public.handle_member_claimed()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  -- Only fire when is_claimed flips to true
  IF NEW.is_claimed = TRUE AND (OLD.is_claimed = FALSE OR OLD.is_claimed IS NULL) THEN
    UPDATE public.profiles
    SET member_id = NEW.id
    WHERE id = NEW.claimed_by_user_id
      AND (member_id IS NULL OR member_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_member_claimed ON public.family_members;
CREATE TRIGGER on_member_claimed
  AFTER UPDATE ON public.family_members
  FOR EACH ROW EXECUTE PROCEDURE public.handle_member_claimed();

-- ═══════════════════════════════════════════════════════════════════════════
-- REALTIME: enable publication for all relevant tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase creates the "supabase_realtime" publication automatically.
-- Add each table to it (ignore errors if already added).
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.family_members;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.memories;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════════════════════
