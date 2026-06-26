-- Migration 048: wealth vector + lifestyle persona on profiles
-- Stores the 6-dimension lifestyle slider values (0-100 each) and computed persona name.
-- Used by /lifestyle page and /matches sorting algorithm.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wealth_vector JSONB,
  ADD COLUMN IF NOT EXISTS lifestyle_persona TEXT;

COMMENT ON COLUMN profiles.wealth_vector IS
  'JSON object: {comfort,travel,housing,spending,luxury,growth} each 0-100. Set by /lifestyle page.';
COMMENT ON COLUMN profiles.lifestyle_persona IS
  'Computed persona label e.g. "Urban Luxury Explorer". Derived from wealth_vector.';
