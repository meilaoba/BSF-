-- Align an early 004 installation with the complete vendor API payload model.
-- Safe on both a fresh database (004 already has these fields) and an existing
-- installation that applied the first 004 revision.

DROP VIEW IF EXISTS v_machine_latest_telemetry;

ALTER TABLE machine_telemetry
  ADD COLUMN IF NOT EXISTS device_key TEXT,
  ADD COLUMN IF NOT EXISTS single_added_material_kg NUMERIC(16,3),
  ADD COLUMN IF NOT EXISTS single_discharge_kg NUMERIC(16,3),
  ADD COLUMN IF NOT EXISTS run_time_min NUMERIC(16,3),
  ADD COLUMN IF NOT EXISTS operating_status_code SMALLINT,
  ADD COLUMN IF NOT EXISTS ferment_state_code SMALLINT,
  ADD COLUMN IF NOT EXISTS feed_code SMALLINT,
  ADD COLUMN IF NOT EXISTS discharge_code SMALLINT,
  ADD COLUMN IF NOT EXISTS deodorizing_code SMALLINT,
  ADD COLUMN IF NOT EXISTS shredder_code SMALLINT,
  ADD COLUMN IF NOT EXISTS fan_code SMALLINT,
  ADD COLUMN IF NOT EXISTS mixing_motor_code SMALLINT,
  ADD COLUMN IF NOT EXISTS zipper_code SMALLINT;

ALTER TABLE machine_telemetry
  ALTER COLUMN ferment_run_time_min TYPE NUMERIC(16,3)
  USING ferment_run_time_min::numeric(16,3);

DROP INDEX IF EXISTS machine_telemetry_source_event_idx;

CREATE UNIQUE INDEX IF NOT EXISTS machine_telemetry_source_event_uidx
  ON machine_telemetry (machine_id, source, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS machine_telemetry_device_key_time_idx
  ON machine_telemetry (device_key, recorded_at DESC)
  WHERE device_key IS NOT NULL;

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
