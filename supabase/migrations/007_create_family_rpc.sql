-- Migration 007: SECURITY DEFINER RPC for family creation
-- This bypasses RLS entirely — no INSERT policy needed on families table.
-- Run this in Supabase SQL Editor → New Query → Run

CREATE OR REPLACE FUNCTION public.create_family(
  p_name        text,
  p_invite_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_user_id   uuid;
BEGIN
  -- Ensure caller is authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check invite code is not already taken
  IF EXISTS (SELECT 1 FROM public.families WHERE invite_code = p_invite_code) THEN
    RAISE EXCEPTION 'Invite code already in use';
  END IF;

  -- Insert family — SECURITY DEFINER runs as function owner, bypassing RLS
  INSERT INTO public.families (name, invite_code, created_by)
  VALUES (p_name, p_invite_code, v_user_id)
  RETURNING id INTO v_family_id;

  RETURN json_build_object(
    'id',          v_family_id,
    'invite_code', p_invite_code
  );
END;
$$;

-- Grant execute to all authenticated users
GRANT EXECUTE ON FUNCTION public.create_family(text, text) TO authenticated;
