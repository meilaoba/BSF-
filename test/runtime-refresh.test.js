import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RUNTIME_CONFIG } from '../src/config/runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('applies the required refresh intervals for each role', () => {
  assert.deepEqual(DEFAULT_RUNTIME_CONFIG.refreshMs, {
    admin: 180000,
    clientAdmin: 600000,
    user: 600000
  });
  const router = fs.readFileSync(path.join(root, 'src/ui/router.js'), 'utf8');
  assert.match(router, /function currentRefreshIntervalMs\(\)/);
  assert.match(router, /window\.BSF_RUNTIME_CONFIG/);
  assert.match(router, /admin:3 \* 60 \* 1000, clientAdmin:10 \* 60 \* 1000, user:10 \* 60 \* 1000/);
  assert.match(router, /currentRole === 'client-admin' \? 'clientAdmin' : currentRole/);
  assert.match(router, /await loadLatestForCurrentRole\(\);\s*await refreshRealtimePage\(\);/);
  assert.doesNotMatch(router, /currentRole === 'admin' && !changed/);
});
