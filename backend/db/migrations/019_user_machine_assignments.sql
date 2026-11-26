-- ===========================================================================
-- Many-to-many user/device authorization
-- ===========================================================================

CREATE TABLE IF NOT EXISTS user_machines (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, machine_id)
);

CREATE INDEX IF NOT EXISTS user_machines_machine_idx
  ON user_machines (machine_id);

-- Preserve all existing one-machine user links.
INSERT INTO user_machines (user_id, machine_id)
SELECT id, machine_id
  FROM users
 WHERE machine_id IS NOT NULL
ON CONFLICT (user_id, machine_id) DO NOTHING;
