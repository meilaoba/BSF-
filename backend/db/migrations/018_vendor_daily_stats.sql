-- Persist the vendor's daily report independently of the 60-day API window.
-- Raw values are retained alongside normalized business units for auditability.
CREATE TABLE IF NOT EXISTS vendor_daily_stats (
  id                        BIGSERIAL PRIMARY KEY,
  vendor_account_id         TEXT NOT NULL,
  vendor_device_id          TEXT NOT NULL,
  vendor_device_name        TEXT,
  stat_date                 DATE NOT NULL,
  run_time_hours            NUMERIC(18,3),
  saved_carbon_kg           NUMERIC(18,3),
  kitchen_waste_raw         NUMERIC(18,6),
  kitchen_waste_kg          NUMERIC(18,3),
  power_consume_raw         NUMERIC(18,6),
  vendor_power_consume_kwh  NUMERIC(18,3),
  device_location           TEXT,
  unloading_weight_raw      NUMERIC(18,6),
  binding_time_ms           BIGINT,
  source_payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vendor_daily_stats_device_date_uidx
    UNIQUE (vendor_account_id, vendor_device_id, stat_date)
);

CREATE INDEX IF NOT EXISTS vendor_daily_stats_account_date_idx
  ON vendor_daily_stats (vendor_account_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS vendor_daily_stats_device_date_idx
  ON vendor_daily_stats (vendor_device_id, stat_date DESC);

-- A worker claim prevents multiple worker instances (or repeated polls) from
-- refreshing the same vendor account more often than the confirmed interval.
CREATE TABLE IF NOT EXISTS vendor_daily_stats_sync_state (
  vendor_account_id  TEXT PRIMARY KEY,
  last_attempt_at    TIMESTAMPTZ,
  last_success_at    TIMESTAMPTZ,
  last_error_code    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
