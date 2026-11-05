-- ===========================================================================
-- Vendor client-admin tenancy
-- A type=2 vendor account may manage multiple local clients and assign only
-- devices returned by its own vendor token.
-- ===========================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS vendor_account_id TEXT;

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS vendor_account_id TEXT;

-- Preserve unambiguous ownership already configured through the old
-- one-client-per-admin model.
WITH client_owners AS (
  SELECT client_id, min(vendor_user_id) AS vendor_account_id
    FROM users
   WHERE role = 'client_admin'
     AND client_id IS NOT NULL
     AND vendor_user_id IS NOT NULL
   GROUP BY client_id
  HAVING count(DISTINCT vendor_user_id) = 1
)
UPDATE clients c
   SET vendor_account_id = owners.vendor_account_id
  FROM client_owners owners
 WHERE c.id = owners.client_id
   AND c.vendor_account_id IS NULL;

UPDATE machines m
   SET vendor_account_id = vd.vendor_user_id
  FROM vendor_devices vd
 WHERE m.vendor_device_id = vd.vendor_device_id
   AND m.vendor_account_id IS NULL
   AND vd.vendor_user_id IS NOT NULL;

DROP INDEX IF EXISTS clients_name_lower_uidx;
DROP INDEX IF EXISTS clients_code_uidx;

-- Master-managed clients use vendor_account_id = NULL. COALESCE keeps their
-- existing global name/code uniqueness while allowing separate vendor tenants.
CREATE UNIQUE INDEX IF NOT EXISTS clients_vendor_name_lower_uidx
  ON clients (COALESCE(vendor_account_id, ''), lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS clients_vendor_code_uidx
  ON clients (COALESCE(vendor_account_id, ''), code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_vendor_account_idx
  ON clients (vendor_account_id);

CREATE INDEX IF NOT EXISTS machines_vendor_account_idx
  ON machines (vendor_account_id);
