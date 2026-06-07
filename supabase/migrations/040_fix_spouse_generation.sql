-- Migration 040: Fix mismatched generation values for spouse members
--
-- Problem: When a spouse is added via the general "Add Member" dialog (or with
-- wrong generation data), their `generation` column may not match their partner's.
-- This causes the hierarchical tree to place the in-law in the wrong row (e.g.
-- the parent-generation row instead of the cousin-generation row).
--
-- Fix: For every spouse pair (A ↔ B) within the same family:
--   • If A has at least one parent in the family (blood member), use A's generation.
--   • Otherwise, if B has at least one parent in the family, use B's generation.
--   • If both or neither have parents (ambiguous), leave unchanged.
--
-- This is idempotent — safe to run multiple times.

DO $$
DECLARE
  rec RECORD;
  blood_gen INTEGER;
  spouse_id UUID;
  spouse_gen INTEGER;
BEGIN
  -- Iterate over every member that has at least one entry in spouse_ids
  FOR rec IN
    SELECT m.id, m.family_id, m.generation, m.parent_ids, m.spouse_ids
    FROM family_members m
    WHERE m.deleted_at IS NULL
      AND array_length(m.spouse_ids, 1) > 0
  LOOP
    -- For each spouse_id in this member's spouse_ids array
    FOREACH spouse_id IN ARRAY rec.spouse_ids
    LOOP
      -- Fetch the spouse row (must be same family, not deleted)
      SELECT generation INTO spouse_gen
      FROM family_members
      WHERE id = spouse_id
        AND family_id = rec.family_id
        AND deleted_at IS NULL;

      IF NOT FOUND THEN
        CONTINUE; -- spouse not in same family or deleted
      END IF;

      -- Skip if already aligned
      IF rec.generation = spouse_gen THEN
        CONTINUE;
      END IF;

      -- Determine which side is the "blood" member (has a parent in this family)
      DECLARE
        rec_has_blood BOOLEAN := EXISTS (
          SELECT 1 FROM unnest(rec.parent_ids) AS pid
          JOIN family_members fm ON fm.id = pid
          WHERE fm.family_id = rec.family_id AND fm.deleted_at IS NULL
        );
        spouse_has_blood BOOLEAN := EXISTS (
          SELECT 1 FROM family_members sp
          JOIN unnest(sp.parent_ids) AS pid ON true
          JOIN family_members fm ON fm.id = pid
          WHERE sp.id = spouse_id
            AND fm.family_id = rec.family_id
            AND fm.deleted_at IS NULL
        );
      BEGIN
        IF rec_has_blood AND NOT spouse_has_blood THEN
          -- rec is blood → spouse (in-law) gets rec's generation
          blood_gen := rec.generation;
          UPDATE family_members
          SET generation = blood_gen
          WHERE id = spouse_id
            AND family_id = rec.family_id
            AND generation != blood_gen;

        ELSIF NOT rec_has_blood AND spouse_has_blood THEN
          -- spouse is blood → rec (in-law) gets spouse's generation
          blood_gen := spouse_gen;
          UPDATE family_members
          SET generation = blood_gen
          WHERE id = rec.id
            AND family_id = rec.family_id
            AND generation != blood_gen;
        END IF;
        -- Both or neither have blood → leave unchanged
      END;
    END LOOP;
  END LOOP;
END;
$$;
