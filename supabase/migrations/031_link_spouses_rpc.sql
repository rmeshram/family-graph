-- Migration 031: Atomic bidirectional spouse-link RPC functions
--
-- Non-atomic client-side spouse sync (two separate UPDATE calls) can leave
-- spouse_ids inconsistent if the second write fails or the tab is closed.
-- These RPCs perform both sides of the update in a single transaction.

-- ── link_spouses: add each member to the other's spouse_ids ─────────────────
CREATE OR REPLACE FUNCTION public.link_spouses(member_a UUID, member_b UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Idempotent: use array_append only when the id is not already present
  UPDATE public.family_members
    SET spouse_ids = array_append(spouse_ids, member_b)
    WHERE id = member_a
      AND NOT (spouse_ids @> ARRAY[member_b]);

  UPDATE public.family_members
    SET spouse_ids = array_append(spouse_ids, member_a)
    WHERE id = member_b
      AND NOT (spouse_ids @> ARRAY[member_a]);
END;
$$;

-- ── unlink_spouses: remove each member from the other's spouse_ids ──────────
CREATE OR REPLACE FUNCTION public.unlink_spouses(member_a UUID, member_b UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.family_members
    SET spouse_ids = array_remove(spouse_ids, member_b)
    WHERE id = member_a;

  UPDATE public.family_members
    SET spouse_ids = array_remove(spouse_ids, member_a)
    WHERE id = member_b;
END;
$$;

-- Grant EXECUTE to authenticated role so the Supabase JS client can call these
-- via .rpc(). The SECURITY DEFINER ensures the function runs with the owner's
-- privileges and can bypass per-row RLS for the second UPDATE leg.
GRANT EXECUTE ON FUNCTION public.link_spouses(UUID, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_spouses(UUID, UUID) TO authenticated;
