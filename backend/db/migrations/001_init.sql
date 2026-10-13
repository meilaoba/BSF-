-- ===========================================================================
-- BSF backend - initial schema
-- Idempotent: safe to re-run.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at in sync
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  code          TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address       TEXT,
  region        TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'archived')),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_name_lower_uidx ON clients (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS clients_code_uidx ON clients (code) WHERE code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- machines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS machines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial      TEXT NOT NULL,
  device_id   TEXT,
  name        TEXT,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  location    TEXT,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  -- Used by the GHG formula: electricity factor differs for HK Island (0.71)
  -- versus the rest of Hong Kong (0.37).
  region      TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive', 'maintenance', 'retired')),
  last_seen_at TIMESTAMPTZ,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS machines_serial_uidx ON machines (serial);
CREATE UNIQUE INDEX IF NOT EXISTS machines_device_id_uidx ON machines (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS machines_client_idx ON machines (client_id);

-- ---------------------------------------------------------------------------
-- users  (Master Admin / Client Admin / User)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT,
  phone         TEXT,
  full_name     TEXT,
  role          TEXT NOT NULL
                CHECK (role IN ('master_admin', 'client_admin', 'user')),
  -- client_admin: the single client they belong to.
  -- user: inherits the client from their linked machine.
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- user role is bound to exactly one machine.
  machine_id    UUID REFERENCES machines(id) ON DELETE SET NULL,
  password_hash TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'invited', 'disabled')),
  last_login_at TIMESTAMPTZ,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uidx ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_client_idx ON users (client_id);
CREATE INDEX IF NOT EXISTS users_machine_idx ON users (machine_id);

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_preferences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope            TEXT NOT NULL DEFAULT 'global'
                   CHECK (scope IN ('global', 'client', 'machine', 'user')),
  client_id        UUID REFERENCES clients(id) ON DELETE CASCADE,
  machine_id       UUID REFERENCES machines(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  enabled          BOOLEAN NOT NULL DEFAULT true,
  min_severity     TEXT NOT NULL DEFAULT 'warning'
                   CHECK (min_severity IN ('info', 'warning', 'critical')),
  quiet_hours_start TIME,
  quiet_hours_end   TIME,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_channel_uidx
  ON notification_preferences (user_id, channel) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_client_channel_uidx
  ON notification_preferences (client_id, channel) WHERE client_id IS NOT NULL AND user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_machine_channel_uidx
  ON notification_preferences (machine_id, channel) WHERE machine_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_global_channel_uidx
  ON notification_preferences (channel)
  WHERE scope = 'global' AND client_id IS NULL AND machine_id IS NULL AND user_id IS NULL;

-- ---------------------------------------------------------------------------
-- notification_recipients  (who receives alerts for which scope)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_recipients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID REFERENCES clients(id) ON DELETE CASCADE,
  machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  address    TEXT NOT NULL,
  name       TEXT,
  verified   BOOLEAN NOT NULL DEFAULT false,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_recipients_uidx
  ON notification_recipients (channel, lower(address), COALESCE(machine_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS notification_recipients_machine_idx ON notification_recipients (machine_id);

-- ---------------------------------------------------------------------------
-- notification_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL,
  channel             TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  locale              TEXT NOT NULL DEFAULT 'en',
  subject             TEXT,
  body                TEXT NOT NULL,
  provider_template   TEXT,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'draft', 'archived')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_uidx
  ON notification_templates (code, channel, locale);

-- ---------------------------------------------------------------------------
-- notification_jobs  (durable queue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  kind          TEXT NOT NULL DEFAULT 'alert',
  severity      TEXT CHECK (severity IN ('info', 'warning', 'critical')),
  to_address    TEXT NOT NULL,
  to_name       TEXT,
  subject       TEXT,
  body          TEXT NOT NULL,
  provider_template TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  machine_id    UUID REFERENCES machines(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'sent', 'failed',
                                  'waiting_config', 'cancelled')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at     TIMESTAMPTZ,
  locked_by     TEXT,
  sent_at       TIMESTAMPTZ,
  last_error    TEXT,
  dedupe_key    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_jobs_queue_idx
  ON notification_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS notification_jobs_created_idx
  ON notification_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS notification_jobs_machine_idx
  ON notification_jobs (machine_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notification_jobs_dedupe_uidx
  ON notification_jobs (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- notification_logs  (append-only delivery history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_logs (
  id                  BIGSERIAL PRIMARY KEY,
  job_id              UUID REFERENCES notification_jobs(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL,
  to_address          TEXT NOT NULL,
  attempt             INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL,
  provider            TEXT,
  provider_message_id TEXT,
  error_code          TEXT,
  error_message       TEXT,
  request             JSONB,
  response            JSONB,
  duration_ms         INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_logs_job_idx ON notification_logs (job_id);
CREATE INDEX IF NOT EXISTS notification_logs_created_idx ON notification_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_type  TEXT NOT NULL DEFAULT 'system'
              CHECK (actor_type IN ('user', 'system', 'api')),
  actor_id    UUID,
  actor_label TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  before      JSONB,
  after       JSONB,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- alert_thresholds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id   UUID REFERENCES machines(id) ON DELETE CASCADE,
  client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
  metric       TEXT NOT NULL DEFAULT 'temperature',
  min_value    NUMERIC,
  max_value    NUMERIC,
  severity     TEXT NOT NULL DEFAULT 'critical'
               CHECK (severity IN ('info', 'warning', 'critical')),
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS alert_thresholds_machine_metric_uidx
  ON alert_thresholds (machine_id, metric) WHERE machine_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- report_jobs / report_files  (report generation, wired later)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL,
  period       TEXT NOT NULL CHECK (period IN ('daily', 'monthly', 'yearly')),
  period_start DATE,
  period_end   DATE,
  scope        TEXT NOT NULL DEFAULT 'client' CHECK (scope IN ('client', 'machine')),
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  machine_id   UUID REFERENCES machines(id) ON DELETE SET NULL,
  format       TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'excel', 'csv')),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_job_id UUID REFERENCES report_jobs(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  byte_size     BIGINT,
  storage_path  TEXT,
  checksum      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients', 'machines', 'users', 'notification_preferences',
    'notification_recipients', 'notification_templates', 'notification_jobs',
    'alert_thresholds', 'report_jobs'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END;
$$;