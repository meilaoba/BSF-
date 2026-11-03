-- Formula v2: transport is derived from each site's monthly mileage, and
-- solar electricity is represented explicitly instead of a negative estimate.
-- Existing operator overrides take precedence, so this migration is safe to
-- re-run and will not overwrite later calibration.
UPDATE clients
   SET metadata = jsonb_set(
         metadata,
         '{ghgFormula}',
         '{"monthlyDistanceKm":140,"solar":false}'::jsonb
           || COALESCE(metadata->'ghgFormula', '{}'::jsonb),
         true
       )
 WHERE lower(btrim(name)) = lower('CIC Zero Carbon Park');

UPDATE clients
   SET metadata = jsonb_set(
         metadata,
         '{ghgFormula}',
         '{"monthlyDistanceKm":24,"solar":true}'::jsonb
           || COALESCE(metadata->'ghgFormula', '{}'::jsonb),
         true
       )
 WHERE lower(btrim(name)) = lower('HSITP');
