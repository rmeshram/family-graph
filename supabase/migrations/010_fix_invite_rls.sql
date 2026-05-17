-- Migration 010: Allow public SELECT on invite_links so users can preview and join families
-- without needing to already be a member of the family.
-- The invite code itself (random 8-char token) is the security credential.

-- Allow anyone (authenticated or anonymous) to SELECT invite_links by code.
-- We keep the original policy for INSERT / UPDATE / DELETE so only family members can manage links.
DROP POLICY IF EXISTS "invites: family" ON public.invite_links;

-- Family members can do everything (insert/update/delete own links)
CREATE POLICY "invites: family can manage"
  ON public.invite_links
  FOR ALL
  USING (family_id = public.my_family_id());

-- Anyone can read invite links (code acts as the access token)
CREATE POLICY "invites: public can read"
  ON public.invite_links
  FOR SELECT
  USING (true);
