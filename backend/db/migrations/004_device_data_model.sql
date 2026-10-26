-- ===========================================================================
-- BSF backend - device, telemetry and reporting data model
-- Aligns PostgreSQL with the vendor device payload and telemetry fields.
-- Safe to apply once through db/migrate.js. No business records are seeded.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Vendor device mirror (source data from emDevice/queryListData)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_devices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_device_id     TEXT NOT NULL UNIQUE,
  vendor_user_id       TEXT,
  vendor_user_name     TEXT,
  serial_number        TEXT,
  device_name          TEXT,
  device_type          INTEGER,
  template_name        TEXT,
  address_code         TEXT,
  online_code          INTEGER CHECK (online_code IS NULL OR online_code >= 0),
  latitude             NUMERIC(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude            NUMERIC(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  device_power         NUMERIC(18,6),
  image_url            TEXT CHECK (image_url IS NULL OR image_url ~ '^https?://'),
  vendor_created_at    TIMESTAMPTZ,
  last_seen_at         TIMESTAMPTZ,
  last_synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_devices_user_idx
  ON vendor_devices (vendor_user_id);
CREATE INDEX IF NOT EXISTS vendor_devices_serial_idx
  ON vendor_devices (serial_number);
CREATE INDEX IF NOT EXISTS vendor_devices_online_idx
  ON vendor_devices (online_code);

-- Explicit linkage only. The database never guesses a client/machine binding.
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS vendor_device_id TEXT
  REFERENCES vendor_devices(vendor_device_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS machines_vendor_device_uidx
  ON machines (vendor_device_id)
  WHERE vendor_device_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Time-series telemetry. Raw vendor API payload is retained in raw_data while
-- frequently queried values are normalized into typed columns.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS machine_telemetry (
  id                    BIGSERIAL PRIMARY KEY,
  machine_id            UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  vendor_device_id      TEXT REFERENCES vendor_devices(vendor_device_id) ON DELETE SET NULL,
  source                TEXT NOT NULL DEFAULT 'api'
                        CHECK (source IN ('vendor', 'api', 'manual')),
  source_event_id       TEXT,
  recorded_at           TIMESTAMPTZ NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_state          INTEGER,
  device_key            TEXT,
  cabin_temp_c          NUMERIC(10,3),
  hot_plate_temp_c      NUMERIC(10,3),
  humidity_pct          NUMERIC(7,3)
                        CHECK (humidity_pct IS NULL OR humidity_pct BETWEEN 0 AND 100),
  real_time_weight_kg   NUMERIC(16,3),
  single_added_material_kg NUMERIC(16,3),
  total_added_material_kg NUMERIC(16,3),
  single_discharge_kg   NUMERIC(16,3),
  total_discharge_kg    NUMERIC(16,3),
  run_time_min          NUMERIC(16,3),
  operating_status_code SMALLINT,
  operating_status      TEXT,
  ferment_state_code    SMALLINT,
  ferment_state         TEXT,
  ferment_run_time_min  NUMERIC(16,3)
                        CHECK (ferment_run_time_min IS NULL OR ferment_run_time_min >= 0),
  feed_code             SMALLINT,
  discharge_code        SMALLINT,
  deodorizing_code      SMALLINT,
  shredder_code         SMALLINT,
  fan_code              SMALLINT,
  mixing_motor_code     SMALLINT,
  zipper_code           SMALLINT,
  energy_kwh            NUMERIC(16,4),
  solar_power_kw        NUMERIC(16,4),
  co2_ppm               NUMERIC(16,4),
  no2_ppm               NUMERIC(16,6),
  h2s_ppm               NUMERIC(16,6),
  signal_pct            NUMERIC(6,2)
                        CHECK (signal_pct IS NULL OR signal_pct BETWEEN -1 AND 100),
  latitude              NUMERIC(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude             NUMERIC(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  raw_data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT machine_telemetry_source_record_uidx
    UNIQUE (machine_id, source, recorded_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS machine_telemetry_source_event_uidx
  ON machine_telemetry (machine_id, source, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS machine_telemetry_machine_time_idx
  ON machine_telemetry (machine_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS machine_telemetry_device_key_time_idx
  ON machine_telemetry (device_key, recorded_at DESC)
  WHERE device_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS machine_telemetry_recorded_brin_idx
  ON machine_telemetry USING brin (recorded_at);

-- ---------------------------------------------------------------------------
-- Durable alert history used by Alert Management and reports.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id        UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  metric            TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL,
  value             NUMERIC(18,6),
  threshold_value   NUMERIC(18,6),
  value_display     TEXT,
  threshold_display TEXT,
  severity          TEXT NOT NULL DEFAULT 'warning'
                    CHECK (severity IN ('info', 'warning', 'critical')),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  location          TEXT,
  message           TEXT,
  dedupe_key        TEXT UNIQUE,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at   TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_events_machine_time_idx
  ON alert_events (machine_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS alert_events_status_idx
  ON alert_events (status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS alert_events_severity_idx
  ON alert_events (severity, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Global dashboard/system settings (singleton row).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name          TEXT,
  default_region        TEXT,
  ghg_formula           JSONB NOT NULL DEFAULT '{}'::jsonb,
  weight_scale_start_kg NUMERIC(16,3) NOT NULL DEFAULT 0
                        CHECK (weight_scale_start_kg >= 0),
  reset_first_date      DATE,
  updated_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO system_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Read models for dashboards and scheduled reports.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_vendor_device_machine AS
SELECT
  vd.*,
  m.id          AS machine_id,
  m.serial      AS machine_serial,
  m.client_id,
  c.name        AS client_name
FROM vendor_devices vd
LEFT JOIN machines m ON m.vendor_device_id = vd.vendor_device_id
LEFT JOIN clients c ON c.id = m.client_id;

CREATE OR REPLACE VIEW v_machine_latest_telemetry AS
SELECT DISTINCT ON (t.machine_id)
  t.machine_id,
  t.vendor_device_id,
  t.source,
  t.source_event_id,
  t.recorded_at,
  t.received_at,
  t.device_state,
  t.device_key,
  t.cabin_temp_c,
  t.hot_plate_temp_c,
  t.humidity_pct,
  t.real_time_weight_kg,
  t.single_added_material_kg,
  t.total_added_material_kg,
  t.single_discharge_kg,
  t.total_discharge_kg,
  t.run_time_min,
  t.operating_status_code,
  t.operating_status,
  t.ferment_state_code,
  t.ferment_state,
  t.ferment_run_time_min,
  t.feed_code,
  t.discharge_code,
  t.deodorizing_code,
  t.shredder_code,
  t.fan_code,
  t.mixing_motor_code,
  t.zipper_code,
  t.energy_kwh,
  t.solar_power_kw,
  t.co2_ppm,
  t.no2_ppm,
  t.h2s_ppm,
  t.signal_pct,
  t.latitude,
  t.longitude,
  t.raw_data
FROM machine_telemetry t
ORDER BY t.machine_id, t.recorded_at DESC, t.id DESC;

-- ---------------------------------------------------------------------------
-- updated_at triggers for mutable tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendor_devices', 'alert_events', 'system_settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END;
$$;
