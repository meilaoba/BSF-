-- ===========================================================================
-- Vendor-authenticated sessions
-- ===========================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_type INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_vendor_user_id_uidx
  ON users (vendor_user_id)
  WHERE vendor_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash                CHAR(64) NOT NULL UNIQUE,
  csrf_hash                 CHAR(64) NOT NULL,
  vendor_access_token_enc   TEXT,
  vendor_refresh_token_enc  TEXT,
  expires_at                TIMESTAMPTZ NOT NULL,
  revoked_at                TIMESTAMPTZ,
  last_seen_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip                        TEXT,
  user_agent                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
  ON auth_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx
  ON auth_sessions (expires_at)
  WHERE revoked_at IS NULL;
