-- Migration 023: Auto-clear profiles.member_id when a claimed node is deleted
--
-- When an admin deletes a family_members row that another user has claimed,
-- the claimant's profiles.member_id becomes a dangling reference.
-- This trigger clears it automatically so the dashboard can detect the orphaned
-- state and show the user an appropriate recovery banner.
--
-- Uses SECURITY DEFINER + fixed search_path to safely update any user's profile
-- from a trigger context (bypasses row-level security on profiles).

CREATE OR REPLACE FUNCTION public.clear_claimed_profile_on_member_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear member_id for any user who had claimed the deleted node.
  -- Also clear family_id so they're fully removed from the family context
  -- (they must re-join via a new invite or be added again by the admin).
  UPDATE profiles
  SET member_id = NULL
  WHERE member_id = OLD.id;

  RETURN OLD;
END;
$$;

-- Drop the trigger if it already exists (idempotent re-run safety)
DROP TRIGGER IF EXISTS trg_clear_claimed_profile_on_member_delete ON public.family_members;

CREATE TRIGGER trg_clear_claimed_profile_on_member_delete
  BEFORE DELETE ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_claimed_profile_on_member_delete();
