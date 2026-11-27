import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const account = fs.readFileSync(path.join(root, 'src/ui/pages/account.js'), 'utf8');
const users = fs.readFileSync(path.join(root, 'src/ui/pages/users.js'), 'utf8');
const apiClient = fs.readFileSync(path.join(root, 'src/ui/api-client.js'), 'utf8');
const backendApi = fs.readFileSync(path.join(root, 'src/api/backend.js'), 'utf8');

test('account password form calls the backend change-password endpoint', () => {
  assert.match(account, /saveAccountPassword/);
  assert.match(account, /window\.BSF_API\.changePassword/);
  assert.match(apiClient, /changePassword:function\(data\)\{ return post\('\/auth\/change-password'/);
  assert.match(backendApi, /changePassword\(data\) \{ return http\.post\('\/auth\/change-password'/);
});

test('managed and unmanaged vendor users expose password reset', () => {
  assert.match(users, /resetUserPassword\(/);
  assert.match(users, /resetVendorUserPassword/);
  assert.match(users, /Temporary password:/);
  assert.match(apiClient, /resetVendorUserPassword:function/);
  assert.match(backendApi, /resetVendorUserPassword\(vendorUserId\)/);
});
