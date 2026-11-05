import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clients = fs.readFileSync(path.join(root, 'src/ui/pages/clients.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'src/ui/state.js'), 'utf8');
const backendData = fs.readFileSync(path.join(root, 'src/ui/backend-data.js'), 'utf8');

test('client admin UI excludes the Clients page while retaining vendor device assignment support', () => {
  const clientAdminNav = state.slice(
    state.indexOf("'client-admin': ["),
    state.indexOf('user: [', state.indexOf("'client-admin': ["))
  );
  assert.doesNotMatch(clientAdminNav, /\{id:'clients',label:'Clients'/);
  assert.match(clients, /assignVendorDevice/);
  assert.match(clients, /device\.vendorDeviceId/);
  assert.doesNotMatch(clients, /updateMachine\(device\.backendId, \{ clientId/);
});

test('client admin scope is no longer restricted to one current client', () => {
  assert.match(state, /function isClientScopedRole\(\)\{\s*return currentRole === 'user';/);
  assert.match(backendData, /role === 'admin' \|\| role === 'client-admin'/);
  assert.match(backendData, /api\.getClients\(\{ limit:500, status:'active' \}\)/);
});
