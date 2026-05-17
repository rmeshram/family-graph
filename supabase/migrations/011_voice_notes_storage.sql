-- ============================================================
-- Migration 011: Voice-notes storage bucket + nullable member_id
-- ============================================================

-- 1. Make member_id nullable (voice notes may not be about a specific member)
ALTER TABLE public.voice_notes ALTER COLUMN member_id DROP NOT NULL;

-- 2. Create storage bucket for voice recordings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-notes',
  'voice-notes',
  true,
  52428800, -- 50 MB
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/x-m4a']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS: authenticated family members can upload
DROP POLICY IF EXISTS "Family members can upload voice notes" ON storage.objects;
CREATE POLICY "Family members can upload voice notes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'voice-notes' AND
  (storage.foldername(name))[1] IN (
    SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- 4. Storage RLS: anyone can read (public bucket for playback)
DROP POLICY IF EXISTS "Anyone can read voice notes" ON storage.objects;
CREATE POLICY "Anyone can read voice notes"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'voice-notes');

-- 5. Storage RLS: uploader can delete their own recordings
DROP POLICY IF EXISTS "Family members can delete voice notes" ON storage.objects;
CREATE POLICY "Family members can delete voice notes"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'voice-notes' AND
  (storage.foldername(name))[1] IN (
    SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
