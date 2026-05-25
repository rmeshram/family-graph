-- Migration 018: Phone authentication support
-- ============================================================================
-- Adds phone-related columns to support Phone+OTP sign-in and family discovery
-- by phone number. All changes are additive (ADD COLUMN IF NOT EXISTS).
-- No existing data is modified; no columns are dropped.

-- ─── family_members ──────────────────────────────────────────────────────────
-- normalized_phone: E.164 format (+91XXXXXXXXXX), indexed for fast lookup
--   during post-OTP family discovery.
-- phone_verified_at: set when a user completes OTP verification and claims
--   this node, confirming ownership of the stored phone number.

ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS normalized_phone text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMENT ON COLUMN public.family_members.normalized_phone IS
  'E.164 phone number (+91XXXXXXXXXX). Used for post-OTP family discovery. NEVER exposed publicly.';

COMMENT ON COLUMN public.family_members.phone_verified_at IS
  'When a user verified ownership of the stored phone via OTP and claimed this node.';

-- Index for O(1) phone lookup during discovery
CREATE INDEX IF NOT EXISTS idx_family_members_normalized_phone
  ON public.family_members (normalized_phone)
  WHERE normalized_phone IS NOT NULL;

-- ─── profiles ────────────────────────────────────────────────────────────────
-- auth_provider: which sign-in method created this account ('email' | 'phone' | 'google').
-- phone_verified_at: mirrors Supabase auth.users.phone_confirmed_at for app-level queries.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMENT ON COLUMN public.profiles.auth_provider IS
  'Primary auth method: ''email'' | ''phone'' | ''google''. Set at sign-up, immutable after first set.';

COMMENT ON COLUMN public.profiles.phone_verified_at IS
  'Mirrors Supabase auth.users.phone_confirmed_at — set after OTP verification.';

-- ─── invite_links ────────────────────────────────────────────────────────────
-- invited_phone: when an admin invites someone by phone number, store it here
--   so the join flow can auto-match them to a family_member node.

ALTER TABLE public.invite_links
  ADD COLUMN IF NOT EXISTS invited_phone text;

COMMENT ON COLUMN public.invite_links.invited_phone IS
  'E.164 phone number of the specific person being invited. Used for auto node-match on join.';

-- ─── RLS note ────────────────────────────────────────────────────────────────
-- normalized_phone is intentionally excluded from the default family_members
-- SELECT policy projection — callers must explicitly request it and it is only
-- returned in admin/server contexts. The existing RLS policies are sufficient;
-- no policy changes are required here.
