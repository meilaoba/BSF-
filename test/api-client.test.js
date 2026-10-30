import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/api-client.js'), 'utf8');

function loadClient(fetchImpl, cookie = '', storedApiBaseUrl = '') {
  const calls = [];
  const removedKeys = [];
  class FakeEvent {
    constructor(type) { this.type = type; }
  }
  const sandbox = {
    console,
    AbortController,
    setTimeout,
    clearTimeout,
    Event: FakeEvent,
    URL,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return fetchImpl(url, options);
    },
    document: { cookie },
    window: {
      location: { origin: 'https://bsf.test' },
      localStorage: {
        getItem() { return storedApiBaseUrl; },
        removeItem(key) { removedKeys.push(key); },
      },
      dispatchEvent() {},
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'api-client.js' });
  return { client: sandbox.window.BSF_API, config: sandbox.window.BSF_API_CONFIG, calls, removedKeys, sandbox };
}

test('classic API bootstrap exposes authenticated analytics requests without ES modules', async () => {
  const { client, config, calls } = loadClient(async () => ({
    ok: true,
    json: async () => ({ ok: true, data: { items: [], summary: { pointCount: 0 } } }),
  }));

  const result = await client.getGraphs({ period: 'monthly', year: 2026, month: 10 });

  assert.equal(config.enabled, true);
  assert.deepEqual(result.summary, { pointCount: 0 });
  assert.equal(calls[0].url, '/api/v1/graphs?period=monthly&year=2026&month=10');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(typeof client.getEnvironmentTemperature, 'function');
});

test('classic API bootstrap sends CSRF and surfaces backend error codes', async () => {
  const { client, calls } = loadClient(async () => ({
    ok: false,
    status: 403,
    json: async () => ({ ok: false, error: { code: 'VENDOR_ACCOUNT_SCOPE_REQUIRED', message: 'scope required' } }),
  }), 'bsf_csrf=csrf-token');

  await assert.rejects(
    () => client.saveSystemSettings({ default_region: 'hk' }),
    (error) => error.code === 'VENDOR_ACCOUNT_SCOPE_REQUIRED' && error.message === 'scope required'
  );
  assert.equal(calls[0].options.headers['X-CSRF-Token'], 'csrf-token');
  assert.equal(calls[0].options.method, 'PUT');
});

test('classic API bootstrap rejects stale cross-origin API URLs', () => {
  const { config, removedKeys } = loadClient(async () => ({
    ok: true,
    json: async () => ({ ok: true, data: {} }),
  }), '', 'http://127.0.0.1:9999/api/v1');

  assert.equal(config.baseUrl, '/api/v1');
  assert.ok(removedKeys.includes('bsf.delivery.apiBaseUrl'));
});

test('vendor session expiry refreshes once and retries the original request', async () => {
  let calls = 0;
  const sequence = [
    { ok:false, status:401, json:async () => ({ error:{ code:'VENDOR_SESSION_EXPIRED', message:'expired' } }) },
    { ok:true, status:200, json:async () => ({ ok:true, data:{ refreshed:true } }) },
    { ok:true, status:200, json:async () => ({ ok:true, data:{ temperatureC:28, value:28 } }) },
  ];
  const { client, calls: requestCalls } = loadClient(async () => {
    const response = sequence[calls];
    calls += 1;
    return response;
  }, 'bsf_csrf=csrf-token');

  const result = await client.getEnvironmentTemperature({ date:'2026-10-30' });
  assert.equal(result.temperatureC, 28);
  assert.equal(calls, 3);
  assert.match(requestCalls[1].url, /\/auth\/refresh$/);
  assert.equal(requestCalls[1].options.headers['X-CSRF-Token'], 'csrf-token');
  assert.match(requestCalls[2].url, /\/environment-temperature\?date=2026-10-30$/);
});
