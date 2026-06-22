-- Migration 046: matrimony_interests
-- Records like/pass/connect_request actions between two biodata profiles.
-- One row per (from_node_id, to_node_id) pair — updated in-place on re-action.

CREATE TABLE IF NOT EXISTS matrimony_interests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id    UUID NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  from_node_id    UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  to_node_id      UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('like', 'pass', 'connect_request')),
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (from_node_id, to_node_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mi_from_node   ON matrimony_interests (from_node_id);
CREATE INDEX IF NOT EXISTS idx_mi_to_node     ON matrimony_interests (to_node_id);
CREATE INDEX IF NOT EXISTS idx_mi_from_user   ON matrimony_interests (from_user_id);
CREATE INDEX IF NOT EXISTS idx_mi_action      ON matrimony_interests (action) WHERE action <> 'pass';

-- updated_at trigger
CREATE OR REPLACE FUNCTION _mi_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_mi_updated_at
  BEFORE UPDATE ON matrimony_interests
  FOR EACH ROW EXECUTE FUNCTION _mi_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE matrimony_interests ENABLE ROW LEVEL SECURITY;

-- I can see interests I sent
CREATE POLICY "mi_select_own_sent"
  ON matrimony_interests FOR SELECT
  USING (from_user_id = auth.uid());

-- I can see likes/connect_requests aimed at my node (not passes)
CREATE POLICY "mi_select_received"
  ON matrimony_interests FOR SELECT
  USING (
    action <> 'pass'
    AND to_node_id IN (
      SELECT id FROM family_members
      WHERE claimed_by_user_id = auth.uid()
    )
  );

-- I can insert interests where I am the actor
CREATE POLICY "mi_insert_own"
  ON matrimony_interests FOR INSERT
  WITH CHECK (from_user_id = auth.uid());

-- I can update (e.g. withdraw) my own sent interests
CREATE POLICY "mi_update_own_sent"
  ON matrimony_interests FOR UPDATE
  USING (from_user_id = auth.uid());

-- Receiver can accept/decline a connect_request
CREATE POLICY "mi_update_received"
  ON matrimony_interests FOR UPDATE
  USING (
    to_node_id IN (
      SELECT id FROM family_members
      WHERE claimed_by_user_id = auth.uid()
    )
  );
