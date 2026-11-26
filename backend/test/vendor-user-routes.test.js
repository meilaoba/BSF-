import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/routes/vendor-users.js'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'src/middleware/session.js'), 'utf8');

test('vendor user routes expose query, assignment read and full replacement write', () => {
  assert.match(source, /router\.get\('\/api\/v1\/vendor-users'/);
  assert.match(source, /listAllVendorUsers\(/);
  assert.match(source, /router\.get\('\/api\/v1\/vendor-users\/assignments'/);
  assert.match(source, /listVendorUserAssignments\(/);
  assert.match(source, /router\.put\('\/api\/v1\/vendor-users\/assignments'/);
  assert.match(source, /replaceVendorUserAssignments\(/);
  assert.match(source, /Array\.isArray\(body\.deviceId\)/);
  assert.match(source, /action: 'vendor_user\.device_assignment'/);
});

test('vendor user identity is resolved server-side and assignments are verified after write', () => {
  assert.match(source, /loadManagedUser\(req, localUserId\)/);
  assert.match(source, /Number\(localUser\.vendor_user_id\)/);
  assert.match(source, /fromUserId/);
  const write = source.indexOf('await replaceVendorUserAssignments(');
  const verify = source.indexOf('await listVendorUserAssignments(', write);
  assert.ok(write >= 0 && verify > write);
  assert.match(source, /FROM clients\s+WHERE id = \$1\s+AND vendor_account_id = \$2/);
});

test('vendor user routes are restricted to user managers', () => {
  assert.match(middleware, /isPathOrChild\('\/api\/v1\/vendor-users'\)/);
  assert.match(middleware, /master_admin', 'client_admin/);
});
