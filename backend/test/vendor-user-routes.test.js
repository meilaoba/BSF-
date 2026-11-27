import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/routes/vendor-users.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'src/routes/auth.js'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'src/middleware/session.js'), 'utf8');
const directory = fs.readFileSync(path.join(root, 'src/routes/directory.js'), 'utf8');
const nginx = [
  'nginx-api.conf',
  'nginx-tls-site.conf',
  'nginx-default-site.conf',
].map((file) => fs.readFileSync(path.join(root, 'deploy', file), 'utf8')).join('\n');

test('vendor user routes expose query, assignment read and full replacement write', () => {
  assert.match(source, /router\.get\('\/api\/v1\/vendor-users'/);
  assert.match(source, /listAllVendorUsers\(/);
  assert.match(source, /router\.get\('\/api\/v1\/vendor-users\/assignments'/);
  assert.match(source, /listVendorUserAssignments\(/);
  assert.match(source, /router\.put\('\/api\/v1\/vendor-users\/assignments'/);
  assert.match(source, /replaceVendorUserAssignments\(/);
  assert.match(source, /Array\.isArray\(body\.deviceId\)/);
  assert.match(source, /action: 'vendor_user\.device_assignment'/);
  assert.match(source, /router\.delete\('\/api\/v1\/vendor-users'/);
  assert.match(source, /action: 'vendor_user\.delete_unmanaged'/);
  assert.match(source, /router\.post\('\/api\/v1\/vendor-users\/reset-password'/);
  assert.match(source, /resetVendorUserPassword\(/);
  assert.match(source, /action: 'vendor_user\.password\.reset'/);
  assert.match(auth, /router\.post\('\/api\/v1\/auth\/change-password'/);
  assert.match(auth, /changeVendorUserPassword\(/);
  assert.match(auth, /action: 'auth\.password\.change'/);
});

test('vendor user identity is resolved server-side and assignments are verified after write', () => {
  assert.match(source, /loadManagedUser\(req, localUserId\)/);
  assert.match(source, /Number\(localUser\.vendor_user_id\)/);
  assert.match(source, /fromUserId/);
  const write = source.indexOf('await replaceVendorUserAssignments(');
  const verify = source.indexOf('await listVendorUserAssignments(', write);
  assert.ok(write >= 0 && verify > write);
  assert.match(source, /FROM clients\s+WHERE id = \$1\s+AND vendor_account_id = \$2/);
  assert.match(source, /ensureLocalMachinesForVendorDevices/);
  assert.match(source, /listAllVendorDevicesCached/);
  assert.match(source, /upsertVendorDevices\(missingRecords\)/);
  assert.match(source, /INSERT INTO machines[\s\S]+ON CONFLICT DO NOTHING/);
});

test('vendor user routes are restricted to user managers', () => {
  assert.match(middleware, /isPathOrChild\('\/api\/v1\/vendor-users'\)/);
  assert.match(middleware, /master_admin', 'client_admin/);
});

test('unmanaged deletion rejects linked users and verifies vendor ownership', () => {
  const deleteStart = source.indexOf("router.delete('/api/v1/vendor-users'");
  const deleteEnd = source.indexOf("router.put('/api/v1/vendor-users/assignments'", deleteStart);
  const block = source.slice(deleteStart, deleteEnd);
  assert.match(block, /vendor_user_id = \$1/);
  assert.match(block, /VENDOR_USER_MANAGED/);
  assert.match(block, /listAllVendorUsers\(/);
  assert.match(block, /record\.id\) === String\(vendorUserId\)/);
  assert.match(block, /await deleteVendorUser\(/);
  assert.match(block, /VENDOR_USER_LOCAL_LINK_CREATED/);
  const localCheck = block.indexOf('SELECT id FROM users');
  const remoteCheck = block.indexOf('await listAllVendorUsers');
  const vendorDelete = block.indexOf('await deleteVendorUser');
  assert.ok(localCheck >= 0 && remoteCheck > localCheck && vendorDelete > remoteCheck);
});

test('vendor user creation has a bounded time budget and structured error statuses', () => {
  assert.match(directory, /vendorUserOperationDeadline\(\)/);
  assert.match(directory, /maxPages: 5/);
  assert.match(directory, /maxPages: 2/);
  assert.match(directory, /VENDOR_USER_CREATE_TIMEOUT/);
  assert.match(directory, /status: 408/);
  assert.match(directory, /VENDOR_USER_CREATE_UNAVAILABLE/);
  assert.match(directory, /status: 424/);
  assert.match(nginx, /location = \/api\/v1\/users/);
  assert.match(nginx, /proxy_read_timeout\s+60s/);
});
