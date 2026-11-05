import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'db/migrations/015_vendor_account_client_ownership.sql'),
  'utf8'
);
const route = fs.readFileSync(path.join(root, 'src/routes/vendor-devices.js'), 'utf8');
const assignmentStart = route.indexOf("router.put('/api/v1/vendor-devices/assignment'");
const assignmentEnd = route.indexOf("router.post('/api/v1/vendor-devices/sync'", assignmentStart);
const assignment = route.slice(assignmentStart, assignmentEnd);

test('migration scopes client and machine ownership by vendor account', () => {
  assert.match(migration, /ALTER TABLE clients\s+ADD COLUMN IF NOT EXISTS vendor_account_id TEXT/);
  assert.match(migration, /ALTER TABLE machines\s+ADD COLUMN IF NOT EXISTS vendor_account_id TEXT/);
  assert.match(migration, /clients_vendor_name_lower_uidx/);
  assert.match(migration, /vendor_account_id = vd\.vendor_user_id/);
});

test('device assignment validates token pool and target client ownership', () => {
  assert.match(assignment, /listAllVendorDevicesCached\(\{ token/);
  assert.match(assignment, /available\.records\.find/);
  assert.match(assignment, /client\.vendor_account_id \|\| ''\) !== actorVendorAccountId/);
  assert.match(assignment, /before\.vendor_account_id/);
  assert.match(assignment, /const machineVendorAccountId = role === 'client_admin'/);
  assert.match(assignment, /vendor_account_id = \$4/);
  assert.match(assignment, /INSERT INTO machines/);
  assert.match(assignment, /UPDATE users SET client_id/);
});
