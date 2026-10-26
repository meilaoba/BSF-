-- Remove the retired MQTT transport label from the telemetry model.
-- Existing records are relabelled because all device data now arrives through
-- the authenticated vendor API or an explicit manual import.

ALTER TABLE machine_telemetry
  DROP CONSTRAINT IF EXISTS machine_telemetry_source_check;

UPDATE machine_telemetry
   SET source = 'api'
 WHERE source = 'mqtt';

ALTER TABLE machine_telemetry
  ALTER COLUMN source SET DEFAULT 'api';

ALTER TABLE machine_telemetry
  ADD CONSTRAINT machine_telemetry_source_check
  CHECK (source IN ('vendor', 'api', 'manual'));
