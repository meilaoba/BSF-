-- Seed the confirmed site formulas. Existing operator overrides take
-- precedence so redeployment does not overwrite later calibration.
UPDATE clients
   SET metadata = jsonb_set(
         metadata,
         '{ghgFormula}',
         '{"monthlyDistanceKm":140,"dailyElectricityKwh":1.5}'::jsonb
           || COALESCE(metadata->'ghgFormula', '{}'::jsonb),
         true
       )
 WHERE lower(btrim(name)) = lower('CIC Zero Carbon Park');

UPDATE clients
   SET metadata = jsonb_set(
         metadata,
         '{ghgFormula}',
         '{"monthlyDistanceKm":24,"dailyElectricityKwh":-1.5}'::jsonb
           || COALESCE(metadata->'ghgFormula', '{}'::jsonb),
         true
       )
 WHERE lower(btrim(name)) = lower('HSITP');
