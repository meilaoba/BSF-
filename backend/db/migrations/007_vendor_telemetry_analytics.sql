-- Persist authenticated vendor realtime samples independently of local machine
-- bindings. Reports and graphs must not depend on browser-local storage.
CREATE TABLE IF NOT EXISTS vendor_device_telemetry (
  id                    BIGSERIAL PRIMARY KEY,
  vendor_account_id     TEXT NOT NULL,
  vendor_device_id      TEXT NOT NULL,
  vendor_device_name    TEXT,
  captured_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_recorded_at    TIMESTAMPTZ,
  cabin_temp_c          NUMERIC(10,3),
  humidity_pct          NUMERIC(7,3)
                        CHECK (humidity_pct IS NULL OR humidity_pct BETWEEN 0 AND 100),
  real_time_weight_kg   NUMERIC(16,3),
  operating_status_code SMALLINT,
  daily_input_t         NUMERIC(18,6),
  weekly_input_t        NUMERIC(18,6),
  monthly_input_t       NUMERIC(18,6),
  yearly_input_t        NUMERIC(18,6),
  daily_output_t        NUMERIC(18,6),
  weekly_output_t       NUMERIC(18,6),
  monthly_output_t      NUMERIC(18,6),
  yearly_output_t       NUMERIC(18,6),
  telemetry             JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_data           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vendor_device_telemetry_capture_uidx
    UNIQUE (vendor_account_id, vendor_device_id, captured_at)
);

CREATE INDEX IF NOT EXISTS vendor_device_telemetry_account_time_idx
  ON vendor_device_telemetry (vendor_account_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS vendor_device_telemetry_device_time_idx
  ON vendor_device_telemetry (vendor_device_id, captured_at DESC);

-- Preserve realtime payload sections on the vendor inventory mirror as well.
ALTER TABLE vendor_devices
  ADD COLUMN IF NOT EXISTS input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_telemetry_at TIMESTAMPTZ;
