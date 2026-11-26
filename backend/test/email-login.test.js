import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auth = fs.readFileSync(path.join(root, 'src/routes/auth.js'), 'utf8');

test('email sign-in resolves the active local user to a vendor username', () => {
  assert.match(auth, /async function resolveVendorLoginName/);
  assert.match(auth, /lower\(email\) = lower\(\$1\)/);
  assert.match(auth, /vendor_username IS NOT NULL/);
  assert.match(auth, /status = 'active'/);
  assert.match(auth, /loginWithVendor\(vendorUserName, password\)/);
});
