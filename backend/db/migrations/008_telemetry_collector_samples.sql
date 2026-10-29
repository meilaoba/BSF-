-- Distinguish scheduled collector samples from legacy request-triggered rows.
ALTER TABLE vendor_device_telemetry
  ADD COLUMN IF NOT EXISTS sample_source TEXT NOT NULL DEFAULT 'request',
  ADD COLUMN IF NOT EXISTS sample_interval_seconds INTEGER;

ALTER TABLE vendor_device_telemetry
  DROP CONSTRAINT IF EXISTS vendor_device_telemetry_sample_source_check;

ALTER TABLE vendor_device_telemetry
  ADD CONSTRAINT vendor_device_telemetry_sample_source_check
  CHECK (sample_source IN ('request', 'worker'));

ALTER TABLE vendor_device_telemetry
  DROP CONSTRAINT IF EXISTS vendor_device_telemetry_sample_interval_check;

ALTER TABLE vendor_device_telemetry
  ADD CONSTRAINT vendor_device_telemetry_sample_interval_check
  CHECK (sample_interval_seconds IS NULL OR sample_interval_seconds IN (180, 600));

CREATE INDEX IF NOT EXISTS vendor_device_telemetry_worker_time_idx
  ON vendor_device_telemetry (vendor_account_id, captured_at DESC)
  WHERE sample_source = 'worker';
