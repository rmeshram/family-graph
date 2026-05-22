-- ============================================================
-- Migration 015: Fix orphaned / duplicate sibling nodes
--
-- Problem:
--   When the user added "Shubham Meshram" (brother) via the dialog,
--   the relationship auto-compute did NOT back-fill parent_ids.
--   As a result:
--     • parent_ids = []  →  generation defaults to 0
--     • Node lands in the parent row on the graph instead of gen-1
--     • No edge is drawn to siblings or parents → invisible to the user
--
--   Additionally, a race condition in the dialog (onAdd was not awaited)
--   caused the same member to be submitted 3 more times, creating 4
--   duplicate rows.  That race condition is fixed in the application code.
--
-- This migration:
--   1. Deletes the 3 duplicate Shubham rows (no relationships, no birth year
--      or duplicate birth year)
--   2. Fixes the surviving row: sets parent_ids and generation to match
--      Rahul Meshram (the self node, a confirmed sibling)
-- ============================================================

-- ── Family identifiers (Meshram family, family_id = b83b2dd1-…) ───────────────
-- Self (Rahul):        5daee003-92a4-442e-bd17-377ed833a9ec  gen=1
-- Father (SUKHDEO):   a478637a-eb9d-4a24-9e61-148e2815a81c  gen=0
-- Mother (Ratnamala): 044fa9c5-f015-40b4-851f-39ab1fe6e4e4  gen=0

-- ── 1. Remove duplicate rows ──────────────────────────────────────────────────
DELETE FROM public.family_members
WHERE id IN (
  '27d40e54-8bb8-46e4-bac8-339c319f3690',  -- "SHUBHAM MESHRAM", b1994, no relationship
  '63d06f0a-4a3b-48bc-8560-d74b4f767e24',  -- "Shubham Meshram", no birth year, no relationship
  'fc12b86f-c39b-41fb-a60e-cbd9bc740707'   -- "Shubham Meshram", no birth year, no relationship
);

-- ── 2. Wire the surviving Shubham row into the tree ───────────────────────────
-- Before: parent_ids=[], generation=0  →  floats in parent row, no edges
-- After:  parent_ids=[father, mother], generation=1  →  sibling of Rahul
UPDATE public.family_members
SET
  parent_ids  = ARRAY[
    'a478637a-eb9d-4a24-9e61-148e2815a81c',   -- SUKHDEO MESHRAM (father)
    '044fa9c5-f015-40b4-851f-39ab1fe6e4e4'    -- Ratnamala Meshram (mother)
  ]::text[],
  generation  = 1,
  relationship = 'brother'
WHERE id = '4da57dd3-5222-4bac-95f0-1cd08c40b1ca';
