import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/routes/directory.js'), 'utf8');
const start = source.indexOf("router.post('/api/v1/clients'");
const end = source.indexOf("router.put('/api/v1/clients'", start);
const createClientBlock = source.slice(start, end);
const updateStart = source.indexOf("router.put('/api/v1/clients'");
const updateEnd = source.indexOf("router.delete('/api/v1/clients'", updateStart);
const updateClientBlock = source.slice(updateStart, updateEnd);

test('client creation SQL and parameter list stay aligned', () => {
  assert.match(createClientBlock, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8\)/);
  assert.match(createClientBlock, /vendor_account_id/);
  assert.match(createClientBlock, /clientAdminVendorAccountId\(req\)/);
  assert.doesNotMatch(createClientBlock, /vendorDeviceId/);
});

test('directory updates and deletes accept the UUID from body, path rewrite or query', () => {
  assert.match(source, /optionalUuid\(body\.id \?\? q\(req\)\.get\('id'\), 'id'\)/);
});

test('client updates can persist site GHG formula overrides', () => {
  assert.match(updateClientBlock, /metadata = COALESCE\(metadata \|\| \$9::jsonb, metadata\)/);
  assert.match(updateClientBlock, /JSON\.stringify\(metadata\)/);
});

test('client admins manage ordinary users only inside their vendor-owned clients', () => {
  const userStart = source.indexOf("router.post('/api/v1/users'");
  const userEnd = source.indexOf("router.get('/api/v1/notification-recipients'", userStart);
  const block = source.slice(userStart, userEnd);
  assert.match(block, /requireUserManager\(req\)/);
  assert.match(block, /const actorVendorAccountId = clientAdminVendorAccountId\(req\)/);
  assert.match(block, /if \(role !== 'user'\) throw new ForbiddenError\(\)/);
  assert.match(block, /await assertClientAdminCanManageUser\(req, before\.rows\[0\]\)/);
  assert.match(block, /machine\.rows\[0\]\.vendor_account_id/);
  assert.match(block, /machine\.rows\[0\]\.client_vendor_account_id/);
  assert.match(block, /await addVendorUser\(/);
  assert.match(block, /vendor_username, vendor_type/);
  assert.match(block, /requireUserRole\(body\.role \?\? 'user'\)/);
  assert.match(block, /m\.vendor_device_id = \$1/);
  assert.match(block, /m\.device_id = \$1/);
  assert.match(block, /m\.serial = \$1/);
  assert.match(block, /machineId = machine\.rows\[0\]\.id/);
});

test('vendor client admins only list clients owned by their vendor account', () => {
  const getStart = source.indexOf("router.get('/api/v1/clients'");
  const getEnd = source.indexOf("router.post('/api/v1/clients'", getStart);
  const block = source.slice(getStart, getEnd);
  assert.match(block, /c\.vendor_account_id = \$\$\{params\.length\}/);
  assert.match(block, /clientAdminVendorAccountId\(req\)/);
});

test('user role input accepts frontend display labels without weakening the enum', () => {
  assert.match(source, /function normalizeUserRole\(value\)/);
  assert.match(source, /role === 'master_admin' \|\| role === 'admin'/);
  assert.match(source, /return requireEnum\(normalizeUserRole\(value\), 'role'/);
});

test('first vendor login attaches to the pending local user by user name', () => {
  const auth = fs.readFileSync(path.join(root, 'src/routes/auth.js'), 'utf8');
  assert.match(auth, /findPendingVendorUser\(vendorUser\.userName\)/);
  assert.match(auth, /WHERE vendor_user_id IS NULL/);
  assert.match(auth, /lower\(vendor_username\) = lower\(\$1\)/);
  assert.match(auth, /UPDATE users\s+SET vendor_user_id = \$1/);
});

test('user deletion permanently removes the local database row', () => {
  const deleteStart = source.indexOf("router.delete('/api/v1/users'");
  const deleteEnd = source.indexOf("router.get('/api/v1/notification-recipients'", deleteStart);
  const block = source.slice(deleteStart, deleteEnd);
  assert.match(block, /DELETE FROM users WHERE id = \$1/);
  assert.doesNotMatch(block, /UPDATE users SET status = 'disabled'/);
  assert.match(block, /action: 'user\.delete'/);
  assert.match(block, /before: \{/);
});
