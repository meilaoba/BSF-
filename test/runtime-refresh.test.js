import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RUNTIME_CONFIG, sanitizeApiBaseUrl } from '../src/config/runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('applies the required refresh intervals for each role', () => {
  assert.deepEqual(DEFAULT_RUNTIME_CONFIG.refreshMs, {
    admin: 1800000,
    clientAdmin: 1800000,
    user: 1800000
  });
  assert.equal(DEFAULT_RUNTIME_CONFIG.humidityScale, 100);
  const router = fs.readFileSync(path.join(root, 'src/ui/router.js'), 'utf8');
  assert.match(router, /function currentRefreshIntervalMs\(\)/);
  assert.match(router, /window\.BSF_RUNTIME_CONFIG/);
  assert.match(router, /admin:30 \* 60 \* 1000, clientAdmin:30 \* 60 \* 1000, user:30 \* 60 \* 1000/);
  assert.match(router, /currentRole === 'client-admin' \? 'clientAdmin' : currentRole/);
  assert.match(router, /await loadLatestForCurrentRole\(\);\s*await refreshRealtimePage\(\);/);
  assert.doesNotMatch(router, /currentRole === 'admin' && !changed/);
});

test('runtime refuses stale cross-origin API base URLs', () => {
  assert.equal(sanitizeApiBaseUrl('http://127.0.0.1:9999/api/v1', 'https://bsf.test'), '');
  assert.equal(sanitizeApiBaseUrl('https://bsf.test/api/v1', 'https://bsf.test'), '/api/v1');
  assert.equal(sanitizeApiBaseUrl('/api/v1', 'https://bsf.test'), '/api/v1');
  assert.equal(sanitizeApiBaseUrl('/other', 'https://bsf.test'), '');
});
