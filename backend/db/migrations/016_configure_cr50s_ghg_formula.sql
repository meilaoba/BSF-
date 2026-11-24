-- CR-50S (365701012616B60D) follows the HSITP 50KG carbon workbook:
-- 24 km/month transport and solar offset. Apply the formula as a machine-level
-- override so GHG is available even when the device has no Client assignment.
UPDATE machines
   SET region = 'non-hk',
       metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{ghgFormula}',
         COALESCE(metadata->'ghgFormula', '{}'::jsonb)
           || '{"monthlyDistanceKm":24,"solar":true}'::jsonb,
         true
       )
 WHERE vendor_device_id = '50'
    OR serial = '365701012616B60D'
    OR device_id = '365701012616B60D';

-- A vendor-only device can be visible in the account pool without having a
-- local machine row. Create that local mirror without assigning a Client so
-- the machine-level GHG formula remains available.
INSERT INTO machines (
  serial,
  device_id,
  name,
  client_id,
  location,
  latitude,
  longitude,
  region,
  status,
  last_seen_at,
  vendor_device_id,
  vendor_account_id,
  metadata
)
SELECT
  vd.serial_number,
  vd.serial_number,
  COALESCE(vd.device_name, vd.serial_number),
  NULL,
  vd.address_code,
  vd.latitude,
  vd.longitude,
  'non-hk',
  'active',
  vd.last_seen_at,
  vd.vendor_device_id,
  vd.vendor_user_id,
  '{"ghgFormula":{"monthlyDistanceKm":24,"solar":true}}'::jsonb
FROM vendor_devices vd
WHERE (
    vd.vendor_device_id = '50'
    OR vd.serial_number = '365701012616B60D'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM machines m
     WHERE m.vendor_device_id = vd.vendor_device_id
        OR m.serial = '365701012616B60D'
  );
