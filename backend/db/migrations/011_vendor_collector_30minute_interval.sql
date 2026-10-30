ALTER TABLE vendor_device_telemetry
  DROP CONSTRAINT IF EXISTS vendor_device_telemetry_sample_interval_check;

ALTER TABLE vendor_device_telemetry
  ADD CONSTRAINT vendor_device_telemetry_sample_interval_check
  CHECK (sample_interval_seconds IS NULL OR sample_interval_seconds IN (180, 600, 1800));
