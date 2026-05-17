-- Migration 009: Claim Flow System
-- Adds: claim_status state machine, claim_requests table, node-specific invites,
--       match suggestion tables, audit log, and user_node_links junction table.

-- ─── Extend family_members ────────────────────────────────────────────────────
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'unclaimed'
    CHECK (claim_status IN ('unclaimed','invite_sent','claim_pending','claimed','rejected','revoked')),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_revoked_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS claim_revoke_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS guardian_user_id UUID REFERENCES auth.users(id);

-- Back-fill existing claimed nodes
UPDATE family_members
  SET claim_status = 'claimed',
      claimed_at   = COALESCE(added_at, now())
  WHERE is_claimed = true
    AND claim_status = 'unclaimed';

-- Indexes for claim operations
CREATE INDEX IF NOT EXISTS idx_fm_claim_status   ON family_members(claim_status);
CREATE INDEX IF NOT EXISTS idx_fm_family_claim   ON family_members(family_id, claim_status);
CREATE INDEX IF NOT EXISTS idx_fm_name_lower     ON family_members(lower(name));

-- ─── Extend invite_links ──────────────────────────────────────────────────────
ALTER TABLE invite_links
  ADD COLUMN IF NOT EXISTS node_id      UUID REFERENCES family_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_type  TEXT NOT NULL DEFAULT 'family'
    CHECK (invite_type IN ('family','node_claim')),
  ADD COLUMN IF NOT EXISTS identity_hint TEXT,
  ADD COLUMN IF NOT EXISTS consumed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_by  UUID REFERENCES auth.users(id);

-- ─── claim_requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  claimant_user_id    UUID NOT NULL REFERENCES auth.users(id),
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','abandoned','expired')),
  verification_method TEXT NOT NULL DEFAULT 'name_dob',
  submitted_name      TEXT,
  submitted_birth_year INT,
  confidence_score    INT CHECK (confidence_score BETWEEN 0 AND 100),
  attempts            INT NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  intent_token        UUID UNIQUE DEFAULT gen_random_uuid(),
  resume_step         TEXT NOT NULL DEFAULT 'verify',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '48 hours',
  UNIQUE (node_id, claimant_user_id)
);

ALTER TABLE claim_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claim_requests_own" ON claim_requests
  FOR ALL USING (claimant_user_id = auth.uid());

CREATE POLICY "claim_requests_family_read" ON claim_requests
  FOR SELECT USING (
    node_id IN (
      SELECT id FROM family_members
      WHERE family_id = (SELECT family_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ─── node_match_dismissals ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS node_match_dismissals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  node_id    UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  reason     TEXT CHECK (reason IN ('not_me','wrong_info','other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id)
);

ALTER TABLE node_match_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dismissals_own" ON node_match_dismissals
  FOR ALL USING (user_id = auth.uid());

-- ─── node_match_suggestions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS node_match_suggestions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  node_id          UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  confidence_score INT CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_tier  TEXT CHECK (confidence_tier IN ('high','medium','low')),
  match_reasons    TEXT[] NOT NULL DEFAULT '{}',
  seen_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id)
);

ALTER TABLE node_match_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suggestions_own" ON node_match_suggestions
  FOR ALL USING (user_id = auth.uid());

-- ─── claim_audit_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_audit_log (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id   UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  family_id UUID REFERENCES families(id),
  actor_id  UUID REFERENCES auth.users(id),
  action    TEXT NOT NULL CHECK (action IN (
    'claim_initiated','claim_verified','claim_completed','claim_rejected',
    'claim_abandoned','claim_revoked','claim_unclaimed','match_dismissed',
    'invite_sent','invite_expired','invite_refreshed','nodes_merged','guardian_claimed'
  )),
  metadata  JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE claim_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_family_read" ON claim_audit_log
  FOR SELECT USING (
    family_id = (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- ─── user_node_links (multi-family profile support) ──────────────────────────
CREATE TABLE IF NOT EXISTS user_node_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  node_id    UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  family_id  UUID NOT NULL REFERENCES families(id),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id)
);

ALTER TABLE user_node_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unl_own" ON user_node_links
  FOR ALL USING (user_id = auth.uid());
