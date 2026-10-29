-- Keep the background collector independent from short-lived browser sessions.
-- Tokens remain encrypted with AUTH_TOKEN_ENCRYPTION_KEY and are never exposed
-- through an API response.
CREATE TABLE IF NOT EXISTS vendor_collector_credentials (
  user_id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vendor_access_token_enc  TEXT NOT NULL,
  vendor_refresh_token_enc TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the dedicated credential from the newest non-revoked login session so
-- existing deployments can continue collecting after this migration.
INSERT INTO vendor_collector_credentials (
  user_id,
  vendor_access_token_enc,
  vendor_refresh_token_enc,
  updated_at
)
SELECT DISTINCT ON (s.user_id)
       s.user_id,
       s.vendor_access_token_enc,
       s.vendor_refresh_token_enc,
       s.created_at
  FROM auth_sessions s
  JOIN users u ON u.id = s.user_id
 WHERE s.vendor_access_token_enc IS NOT NULL
   AND u.status = 'active'
 ORDER BY s.user_id, (s.revoked_at IS NULL) DESC, s.created_at DESC
ON CONFLICT (user_id) DO UPDATE SET
  vendor_access_token_enc = EXCLUDED.vendor_access_token_enc,
  vendor_refresh_token_enc = EXCLUDED.vendor_refresh_token_enc,
  updated_at = EXCLUDED.updated_at;
