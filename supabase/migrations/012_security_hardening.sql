-- ============================================================
-- Migration 012: Security hardening
--   1. Tighten storage RLS for legacy family-photos & voice-notes buckets
--      (the original policies in 001 leaked across families)
--   2. Add missing DELETE / UPDATE policies on family_links
--   3. Add missing UPDATE policy on profiles (was insert/select only)
-- ============================================================

-- ─── 1. Storage hardening ────────────────────────────────────────────────────

-- family-photos: scope read & write to the uploader's family folder.
-- Path convention: family-photos/<family_id_uuid>/...
DROP POLICY IF EXISTS "photos: family read"   ON storage.objects;
DROP POLICY IF EXISTS "photos: family insert" ON storage.objects;
DROP POLICY IF EXISTS "photos: family update" ON storage.objects;
DROP POLICY IF EXISTS "photos: family delete" ON storage.objects;

CREATE POLICY "photos: family read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'family-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
CREATE POLICY "photos: family insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'family-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
CREATE POLICY "photos: family delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'family-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- voice-notes (legacy, private bucket from 001):
-- 011 already created/recreated the public 'voice-notes' bucket. These policies
-- continue to scope by family folder so legacy private setups stay safe.
DROP POLICY IF EXISTS "vnote: family read"   ON storage.objects;
DROP POLICY IF EXISTS "vnote: family insert" ON storage.objects;
DROP POLICY IF EXISTS "vnote: family delete" ON storage.objects;
CREATE POLICY "vnote: family read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND (storage.foldername(name))[1] IN (
    SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
-- INSERT / DELETE for 'voice-notes' are owned by 011_voice_notes_storage.sql.

-- ─── 2. family_links: missing admin DELETE policy ────────────────────────────
DROP POLICY IF EXISTS "family_links: admin delete" ON public.family_links;
CREATE POLICY "family_links: admin delete" ON public.family_links FOR DELETE
USING (
  (family_a_id = public.my_family_id() OR family_b_id = public.my_family_id())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─── 3. profiles: missing UPDATE policy (so users can update their own row) ──
DROP POLICY IF EXISTS "profiles: self update" ON public.profiles;
CREATE POLICY "profiles: self update" ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
