import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'db/migrations/019_user_machine_assignments.sql'),
  'utf8'
);
const session = fs.readFileSync(path.join(root, 'src/middleware/session.js'), 'utf8');
const directory = fs.readFileSync(path.join(root, 'src/routes/directory.js'), 'utf8');
const deviceData = fs.readFileSync(path.join(root, 'src/routes/device-data.js'), 'utf8');
const vendorUsers = fs.readFileSync(path.join(root, 'src/routes/vendor-users.js'), 'utf8');

test('creates an idempotent many-to-many user/machine relation and backfills legacy links', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_machines/);
  assert.match(migration, /PRIMARY KEY \(user_id, machine_id\)/);
  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES machines\(id\) ON DELETE CASCADE/);
  assert.match(migration, /INSERT INTO user_machines/);
  assert.match(migration, /ON CONFLICT \(user_id, machine_id\) DO NOTHING/);
});

test('session and data scopes carry every assigned machine', () => {
  assert.match(session, /json_agg\(DISTINCT um\.machine_id::text\)/);
  assert.match(session, /machineIds/);
  assert.match(session, /searchParams\.set\('machineIds', machineIds\.join\(','\)\)/);
  assert.match(directory, /\.machine_id = ANY\(\$\$\{params\.length\}::uuid\[\]\)/);
  assert.match(deviceData, /req\.auth\.user\.machineIds/);
});

test('vendor assignment replaces the complete local user/machine set', () => {
  assert.match(vendorUsers, /DELETE FROM user_machines WHERE user_id = \$1/);
  assert.match(vendorUsers, /INSERT INTO user_machines \(user_id, machine_id\)/);
  assert.match(vendorUsers, /await replaceUserMachines\(localUser\.id, assignedMachines\)/);
  assert.match(vendorUsers, /localMachineIds: assignedMachines\.map/);
});
