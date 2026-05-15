-- ============================================================
-- Migration 005: Storage buckets + birth_month/birth_day fields
-- ============================================================

-- 1. Add birth_month and birth_day columns so we can send birthday push notifications
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS birth_month smallint CHECK (birth_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS birth_day   smallint CHECK (birth_day   BETWEEN 1 AND 31);

-- 2. Create storage buckets
-- Run these in the Supabase dashboard Storage section OR via the Management API.
-- SQL itself cannot create buckets, but we document the required config here:

-- Bucket: "memories"   (public, 10 MB limit, image/* only)
-- Bucket: "members"    (public, 5 MB limit,  image/* only)
-- Bucket: "avatars"    (public, 5 MB limit,  image/* only)

-- 3. Storage RLS policies (applied via SQL once buckets exist)

-- memories bucket: family members can upload / read
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('memories', 'memories', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('members',  'members',  true,  5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('avatars',  'avatars',  true,  5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users in the same family to upload to memories/
CREATE POLICY "Family members can upload memories"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'memories' AND
  (storage.foldername(name))[1] IN (
    SELECT family_id::text FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Anyone can read memories"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'memories');

-- Allow authenticated users to upload to members/ scoped by their family_id
CREATE POLICY "Family members can upload member photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'members' AND
  (storage.foldername(name))[1] IN (
    SELECT family_id::text FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Anyone can read member photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'members');

-- Allow users to upload their own avatar (path = {user_id}/avatar.ext)
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can read avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');
