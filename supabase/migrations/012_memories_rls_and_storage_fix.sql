-- ============================================================
-- Migration 012: Fix memories / voice_notes RLS + storage DELETE
-- ============================================================

-- ── memories table: split FOR ALL into explicit per-operation policies ────────
-- The previous "FOR ALL USING (...)" policy can silently block INSERTs because
-- PostgreSQL evaluates USING as WITH CHECK for inserts only when the expressions
-- are exactly right. Explicit policies are clearer and more reliable.

DROP POLICY IF EXISTS "memories: family"              ON public.memories;
DROP POLICY IF EXISTS "memories: family select"       ON public.memories;
DROP POLICY IF EXISTS "memories: family insert"       ON public.memories;
DROP POLICY IF EXISTS "memories: family update"       ON public.memories;
DROP POLICY IF EXISTS "memories: family delete"       ON public.memories;

CREATE POLICY "memories: family select"
  ON public.memories FOR SELECT
  USING (family_id = public.my_family_id());

CREATE POLICY "memories: family insert"
  ON public.memories FOR INSERT
  WITH CHECK (family_id = public.my_family_id());

CREATE POLICY "memories: family update"
  ON public.memories FOR UPDATE
  USING (family_id = public.my_family_id())
  WITH CHECK (family_id = public.my_family_id());

CREATE POLICY "memories: family delete"
  ON public.memories FOR DELETE
  USING (family_id = public.my_family_id());

-- ── voice_notes table: same split ─────────────────────────────────────────────
DROP POLICY IF EXISTS "vnotes: family"               ON public.voice_notes;
DROP POLICY IF EXISTS "vnotes: family select"        ON public.voice_notes;
DROP POLICY IF EXISTS "vnotes: family insert"        ON public.voice_notes;
DROP POLICY IF EXISTS "vnotes: family update"        ON public.voice_notes;
DROP POLICY IF EXISTS "vnotes: family delete"        ON public.voice_notes;

CREATE POLICY "vnotes: family select"
  ON public.voice_notes FOR SELECT
  USING (family_id = public.my_family_id());

CREATE POLICY "vnotes: family insert"
  ON public.voice_notes FOR INSERT
  WITH CHECK (family_id = public.my_family_id());

CREATE POLICY "vnotes: family update"
  ON public.voice_notes FOR UPDATE
  USING (family_id = public.my_family_id())
  WITH CHECK (family_id = public.my_family_id());

CREATE POLICY "vnotes: family delete"
  ON public.voice_notes FOR DELETE
  USING (family_id = public.my_family_id());

-- ── Storage: add DELETE + UPDATE policies for memories bucket ─────────────────
-- Required so deleteMemory can also remove the uploaded file from storage.

DROP POLICY IF EXISTS "Family members can delete memories"    ON storage.objects;
DROP POLICY IF EXISTS "Family members can update memories"    ON storage.objects;
DROP POLICY IF EXISTS "Family members can delete voice notes" ON storage.objects;

CREATE POLICY "Family members can delete memories"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'memories' AND
    (storage.foldername(name))[1] IN (
      SELECT family_id::TEXT FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Family members can update memories"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'memories' AND
    (storage.foldername(name))[1] IN (
      SELECT family_id::TEXT FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Family members can delete voice notes"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'voice-notes' AND
    (storage.foldername(name))[1] IN (
      SELECT family_id::TEXT FROM public.profiles WHERE id = auth.uid()
    )
  );
