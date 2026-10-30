import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const { closePool } = await import('../src/db.js');
const { config } = await import('../src/config.js');
const {
  analyticsDeviceLookup,
  analyticsScopeForUser,
  dateRangeForRequest,
  rawSampleRange,
} = await import('../src/routes/analytics.js');
const {
  mergeLatestVendorTelemetry,
  scopedDeviceForRole,
} = await import('../src/routes/vendor-devices.js');
const { publicUser } = await import('../src/middleware/session.js');
const { vendorAccountIdForSession } = await import('../src/services/vendor-analytics.js');

test.after(async () => closePool());

test('confirmed formula and polling defaults remain configurable', () => {
  assert.equal(config.formula.wasteReductionFactor, 1.5);
  assert.equal(config.formula.energyFactorHkIsland, 0.71);
  assert.equal(config.formula.energyFactorOther, 0.37);
  assert.equal(config.formula.fertilizerRatio, 0.12);
  assert.equal(config.formula.humidityScale, 100);
  assert.equal(config.auth.vendor.realtimeEnabled, true);
  assert.equal(config.auth.vendor.accessTokenTtlDays, 7);
  assert.equal(config.auth.vendor.refreshTokenTtlDays, 8);
});

test('graph range uses explicit start and end dates for every period', () => {
  const range = dateRangeForRequest(new URL(
    'http://localhost/api/v1/graphs?start=2026-10-16&end=2026-10-31'
  ), 'monthly', new Date('2026-10-30T00:00:00Z'));
  assert.deepEqual(range, { start:'2026-10-16', end:'2026-10-31' });
  assert.throws(
    () => dateRangeForRequest(new URL(
      'http://localhost/api/v1/graphs?start=2026-10-16&end=2026-10-17'
    ), 'daily', new Date('2026-10-30T00:00:00Z')),
    (error) => error.code === 'VALIDATION_ERROR'
  );
});

test('master admin may request a client or machine scope', () => {
  assert.deepEqual(
    analyticsScopeForUser(
      { role: 'master_admin', clientId: null, machineId: null },
      { clientId: 'client-a', machineId: 'machine-a' }
    ),
    { role: 'master_admin', clientId: 'client-a', machineId: 'machine-a' }
  );
});

test('client admin cannot replace their client but may filter inside it', () => {
  assert.deepEqual(
    analyticsScopeForUser(
      { role: 'client_admin', clientId: 'trusted-client' },
      { clientId: 'forged-client', machineId: 'machine-a' }
    ),
    { role: 'client_admin', clientId: 'trusted-client', machineId: 'machine-a' }
  );
  assert.throws(
    () => analyticsScopeForUser({ role: 'client_admin', clientId: null }, {}),
    (error) => error.code === 'VENDOR_ACCOUNT_SCOPE_REQUIRED'
  );
});

test('device lookup keeps client admin and user machine filters inside their trusted scope', () => {
  assert.deepEqual(
    analyticsDeviceLookup({ role: 'client_admin', clientId: 'trusted-client', machineId: 'machine-a' }),
    { clientId: 'trusted-client', machineId: 'machine-a' }
  );
  assert.deepEqual(
    analyticsDeviceLookup({ role: 'user', clientId: 'trusted-client', machineId: 'trusted-machine' }),
    { clientId: 'trusted-client', machineId: 'trusted-machine' }
  );
  assert.equal(analyticsDeviceLookup({ role: 'master_admin', clientId: null, machineId: null }), null);
});
test('user scope always uses the single linked machine', () => {
  assert.deepEqual(
    analyticsScopeForUser(
      { role: 'user', clientId: 'trusted-client', machineId: 'trusted-machine' },
      { clientId: 'forged-client', machineId: 'forged-machine' }
    ),
    { role: 'user', clientId: 'trusted-client', machineId: 'trusted-machine' }
  );
  assert.throws(
    () => analyticsScopeForUser({ role: 'user', clientId: 'trusted-client', machineId: null }, {}),
    (error) => error.code === 'VENDOR_ACCOUNT_SCOPE_REQUIRED'
  );
});

test('unknown roles fail closed', () => {
  assert.throws(
    () => analyticsScopeForUser({ role: 'viewer' }, {}),
    (error) => error.code === 'VENDOR_ACCOUNT_SCOPE_REQUIRED'
  );
});

test('session analytics use the vendor account id instead of the local user id', () => {
  const user = publicUser({
    id: '911c0a53-fe0f-4372-a615-a87f588ace13',
    vendor_user_id: '44',
    role: 'client_admin',
    metadata: {},
  });
  assert.equal(user.vendorUserId, '44');
  assert.equal(
    vendorAccountIdForSession({ user }),
    '44'
  );
});

test('analytics migration preserves source units and prevents duplicate captures', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = fs.readFileSync(path.join(root, 'db/migrations/007_vendor_telemetry_analytics.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vendor_device_telemetry/);
  assert.match(sql, /daily_input_t\s+NUMERIC/);
  assert.match(sql, /monthly_input_t\s+NUMERIC/);
  assert.match(sql, /yearly_input_t\s+NUMERIC/);
  assert.match(sql, /UNIQUE \(vendor_account_id, vendor_device_id, captured_at\)/);
  assert.match(sql, /vendor_device_telemetry_account_time_idx/);
  assert.match(sql, /vendor_device_telemetry_device_time_idx/);
});

test('environment temperature migration stores HKO samples and daily values', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = fs.readFileSync(path.join(root, 'db/migrations/010_environment_temperature.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS environment_temperature_samples/);
  assert.match(sql, /UNIQUE \(station, observed_at\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS environment_daily_temperature/);
  assert.match(sql, /status IN \('provisional', 'official'\)/);
});

test('tenant device payloads retain authorized telemetry and omit raw input/output', () => {
  const device = {
    id:'vendor-1',
    telemetry:{ RealTimeWeight:10, CabinTemp:40, Humidity:50, OperatingStatus:2, TotalAddMaterial:1 },
    input:{ dailyInput:0.2 },
    output:{ dailyOutput:0.1 }
  };
  assert.strictEqual(scopedDeviceForRole(device, 'master_admin'), device);
  assert.deepEqual(scopedDeviceForRole(device, 'client_admin'), {
    id:'vendor-1',
    telemetry:{ RealTimeWeight:10, CabinTemp:40, Humidity:50, OperatingStatus:2, TotalAddMaterial:1 },
    input:undefined,
    output:undefined
  });
});

test('latest complete saved telemetry fills only fields missing from a partial vendor snapshot', () => {
  const devices = [{
    id:'52',
    telemetry:{ TotalAddMaterial:0.1 },
    input:{},
    output:{},
  }];
  const latest = new Map([['52', {
    capturedAt:'2026-10-29T00:00:00.000Z',
    telemetry:{
      TotalAddMaterial:0.09,
      RealTimeWeight:12.3,
      CabinTemp:39.8,
      Humidity:0.2,
    },
    input:{ monthlyInput:0.099 },
    output:{},
  }]]);
  const merged = mergeLatestVendorTelemetry(devices, latest)[0];
  assert.equal(merged.telemetry.TotalAddMaterial, 0.1);
  assert.equal(merged.telemetry.RealTimeWeight, 12.3);
  assert.equal(merged.telemetry.CabinTemp, 39.8);
  assert.equal(merged.input.monthlyInput, 0.099);
  assert.equal(merged.latestTelemetryAt, '2026-10-29T00:00:00.000Z');
});

test('raw sample route is scheduled-worker data and caps pages at 30', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'src/routes/analytics.js'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/services/vendor-analytics.js'), 'utf8');
  assert.match(service, /sample_source = 'worker'/);
  assert.match(source, /pageSize[^\n]+max: 30/);
  assert.match(source, /if \(!req\.auth\.user\.clientId\) throw forbiddenAccount\(\)/);
  assert.match(source, /source: 'worker'/);
});

test('raw sample range preserves times and uses an exclusive end boundary', () => {
  const range = rawSampleRange(new URL(
    'http://localhost/api/v1/raw-data-samples?start=2026-10-28T00:00&end=2026-10-29T00:00'
  ));
  assert.deepEqual(range, {
    start:'2026-10-28T00:00:00',
    end:'2026-10-29T00:00:00',
  });
});

test('raw sample range keeps date-only end dates backward compatible', () => {
  const range = rawSampleRange(new URL(
    'http://localhost/api/v1/raw-data-samples?start=2026-10-28&end=2026-10-28'
  ));
  assert.deepEqual(range, {
    start:'2026-10-28T00:00:00',
    end:'2026-10-29T00:00:00',
  });
});

test('raw sample range allows a full 60-day window', () => {
  const range = rawSampleRange(new URL(
    'http://localhost/api/v1/raw-data-samples?start=2026-08-30T00:00&end=2026-10-29T00:00'
  ));
  assert.deepEqual(range, {
    start:'2026-08-30T00:00:00',
    end:'2026-10-29T00:00:00',
  });
});
