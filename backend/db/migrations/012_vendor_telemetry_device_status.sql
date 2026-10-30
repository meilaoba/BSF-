-- Preserve the vendor deviceOnline code at collection time. Raw Data must use
-- the same three-state source as Machines and Locations.
ALTER TABLE vendor_device_telemetry
  ADD COLUMN IF NOT EXISTS device_online_code SMALLINT;

ALTER TABLE vendor_device_telemetry
  DROP CONSTRAINT IF EXISTS vendor_device_telemetry_device_online_code_check;

ALTER TABLE vendor_device_telemetry
  ADD CONSTRAINT vendor_device_telemetry_device_online_code_check
  CHECK (device_online_code IS NULL OR device_online_code >= 0);
