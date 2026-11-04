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
  assert.match(createClientBlock, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7\)/);
  assert.doesNotMatch(createClientBlock, /vendorDeviceId/);
});

test('directory updates and deletes accept the UUID from body, path rewrite or query', () => {
  assert.match(source, /optionalUuid\(body\.id \?\? q\(req\)\.get\('id'\), 'id'\)/);
});

test('client updates can persist site GHG formula overrides', () => {
  assert.match(updateClientBlock, /metadata = COALESCE\(metadata \|\| \$9::jsonb, metadata\)/);
  assert.match(updateClientBlock, /JSON\.stringify\(metadata\)/);
});

test('client admins can manage only ordinary users inside their own client', () => {
  const userStart = source.indexOf("router.post('/api/v1/users'");
  const userEnd = source.indexOf("router.get('/api/v1/notification-recipients'", userStart);
  const block = source.slice(userStart, userEnd);
  assert.match(block, /requireUserManager\(req\)/);
  assert.match(block, /if \(actorClientId\) \{/);
  assert.match(block, /if \(role !== 'user'\) throw new ForbiddenError\(\)/);
  assert.match(block, /String\(clientId\) !== String\(actorClientId\)/);
  assert.match(block, /assertClientAdminCanManageUser\(req, before\.rows\[0\]\)/);
  assert.match(block, /String\(machine\.rows\[0\]\.client_id \|\| ''\) !== String\(actorClientId\)/);
  assert.match(block, /await addVendorUser\(/);
  assert.match(block, /vendor_username, vendor_type/);
  assert.match(block, /requireUserRole\(body\.role \?\? 'user'\)/);
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
