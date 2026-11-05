import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.VENDOR_DAILY_STATS_URL = '';

const { closePool } = await import('../src/db.js');
const { config } = await import('../src/config.js');
const {
  analyticsDeviceLookup,
  analyticsScopeForUser,
  dateRangeForRequest,
  matchVendorDeviceId,
  rawSampleRange,
  reportTemperatureHumidityRows,
} = await import('../src/routes/analytics.js');
const {
  listVendorDevicesWithCollectorRefresh,
  mergeLatestVendorTelemetry,
  scopedDeviceForRole,
  mergeVendorDeviceSyncTimes,
} = await import('../src/routes/vendor-devices.js');
const { publicUser } = await import('../src/middleware/session.js');
const {
  mapVendorTelemetryHistoryRow,
  vendorAccountIdForSession,
} = await import('../src/services/vendor-analytics.js');

test.after(async () => closePool());

test('confirmed formula and polling defaults remain configurable', () => {
  assert.equal(config.formula.wasteReductionFactor, 1.5);
  assert.equal(config.formula.energyFactorHkIsland, 0.71);
  assert.equal(config.formula.energyFactorOther, 0.37);
  assert.equal(config.formula.dailyElectricityKwh, 1.5);
  assert.equal(config.auth.vendor.kitchenWasteToKgFactor, 1);
  assert.equal(config.auth.vendor.powerConsumeToKwhFactor, 1);
  assert.equal(
    config.auth.vendor.dailyStatsUrl,
    'https://iot.creekscomposter.com:8888/historyData/deviceList'
  );
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

test('client admin can select among vendor-owned clients without a fixed client binding', () => {
  assert.deepEqual(
    analyticsScopeForUser(
      { role: 'client_admin', vendorUserId: '51' },
      { clientId: 'client-a', machineId: 'machine-a' }
    ),
    { role: 'client_admin', clientId: 'client-a', machineId: 'machine-a' }
  );
  assert.deepEqual(
    analyticsScopeForUser({ role: 'client_admin', vendorUserId: '51' }, {}),
    { role: 'client_admin', clientId: null, machineId: null }
  );
});

test('vendor device selectors accept vendor IDs and serial numbers', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const records = [
    { id: '501', serialNumber: '365701012631B883' },
    { id: '502', serialNumber: '365701012631B884' },
  ];
  assert.equal(matchVendorDeviceId(records, '501'), '501');
  assert.equal(matchVendorDeviceId(records, '365701012631B883'), '501');
  assert.equal(matchVendorDeviceId(records, 'missing'), null);
  assert.match(
    fs.readFileSync(path.join(root, 'src/routes/analytics.js'), 'utf8'),
    /role === 'client_admin' && !scope\.clientId[\s\S]+listAllVendorDevicesCached/
  );
});

test('device lookup keeps client admin and user machine filters inside their trusted scope', () => {
  assert.deepEqual(
    analyticsDeviceLookup({ role: 'client_admin', clientId: 'trusted-client', machineId: 'machine-a' }),
    { clientId: 'trusted-client', machineId: 'machine-a', vendorAccountId: null }
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

test('linked device scope reads telemetry stored by the collector account', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const service = fs.readFileSync(path.join(root, 'src/services/vendor-analytics.js'), 'utf8');
  const history = service.slice(
    service.indexOf('export async function loadVendorTelemetryHistory'),
    service.indexOf('export async function loadLatestVendorTelemetrySnapshots')
  );
  const latest = service.slice(
    service.indexOf('export async function loadLatestVendorTelemetrySnapshots'),
    service.indexOf('export async function resolveVendorDeviceIds')
  );
  const summaries = service.slice(service.indexOf('export async function loadVendorTelemetrySummaries'));
  assert.match(history, /!includeAllAccounts && !Array\.isArray\(deviceIds\)/);
  assert.match(latest, /!includeAllAccounts && !Array\.isArray\(deviceIds\)/);
  assert.match(summaries, /!includeAllAccounts && !Array\.isArray\(deviceIds\)/);
  assert.match(latest, /device_online_code/);
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

test('vendor telemetry migration preserves deviceOnline status at collection time', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = fs.readFileSync(
    path.join(root, 'db/migrations/012_vendor_telemetry_device_status.sql'),
    'utf8'
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS device_online_code SMALLINT/);
  assert.match(sql, /vendor_device_telemetry_device_online_code_check/);
});

test('site carbon formula migration seeds CIC and HSITP defaults', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = fs.readFileSync(
    path.join(root, 'db/migrations/013_site_carbon_formula_defaults.sql'),
    'utf8'
  );
  const service = fs.readFileSync(
    path.join(root, 'src/services/vendor-analytics.js'),
    'utf8'
  );
  assert.match(sql, /"monthlyDistanceKm":140,"dailyElectricityKwh":1\.5/);
  assert.match(sql, /"monthlyDistanceKm":24,"dailyElectricityKwh":-1\.5/);
  assert.match(sql, /metadata->'ghgFormula'/);
  assert.match(service, /m\.metadata->'ghgFormula'/);
  assert.match(service, /c\.metadata->'ghgFormula'/);
  assert.match(service, /loadVendorDeviceReportSettings/);
});

test('site carbon formula v2 marks CIC non-solar and HSITP solar', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = fs.readFileSync(
    path.join(root, 'db/migrations/014_site_formula_v2.sql'),
    'utf8'
  );
  assert.match(sql, /"monthlyDistanceKm":140,"solar":false/);
  assert.match(sql, /"monthlyDistanceKm":24,"solar":true/);
  assert.match(sql, /COALESCE\(metadata->'ghgFormula', '\{\}'::jsonb\)/);
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

test('vendor device responses expose the local mirror sync time', () => {
  const devices = [
    { id: '52', deviceName: 'CR-30S_QX2026124' },
    { id: '53', deviceName: 'Unsynced' },
  ];
  const merged = mergeVendorDeviceSyncTimes(
    devices,
    new Map([['52', '2026-11-03T04:09:00.415Z']])
  );

  assert.equal(merged[0].lastSyncedAt, '2026-11-03T04:09:00.415Z');
  assert.equal(merged[1].lastSyncedAt, undefined);
  assert.equal(devices[0].lastSyncedAt, undefined);
});

test('manual vendor sync refreshes an expired collector token once and retries', async () => {
  const calls = [];
  let refreshCalls = 0;
  const result = await listVendorDevicesWithCollectorRefresh({
    collector: {
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
    },
    pageNum: 2,
    pageSize: 50,
    listDevices: async ({ token, pageNum, pageSize }) => {
      calls.push({ token, pageNum, pageSize });
      if (token === 'expired-token') {
        const error = new Error('expired');
        error.code = 'VENDOR_SESSION_EXPIRED';
        throw error;
      }
      return { records: [{ id: '52' }], pagination: { current: pageNum } };
    },
    refreshCollector: async (collector, currentToken) => {
      refreshCalls += 1;
      assert.equal(collector.refreshToken, 'refresh-token');
      assert.equal(currentToken, 'expired-token');
      return 'fresh-token';
    },
  });

  assert.equal(refreshCalls, 1);
  assert.deepEqual(calls, [
    { token: 'expired-token', pageNum: 2, pageSize: 50 },
    { token: 'fresh-token', pageNum: 2, pageSize: 50 },
  ]);
  assert.equal(result.records[0].id, '52');
});

test('raw sample route is scheduled-worker data and caps pages at 30', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'src/routes/analytics.js'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/services/vendor-analytics.js'), 'utf8');
  assert.match(service, /sample_source = 'worker'/);
  assert.match(source, /pageSize[^\n]+max: 30/);
  assert.match(source, /deviceIds = await resolveVendorDeviceIds\(\{ clientId, machineId, vendorAccountId \}\)/);
  assert.match(source, /source: 'worker'/);
});

test('device-data reads the canonical vendor telemetry store and keeps legacy ingest isolated', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const route = fs.readFileSync(path.join(root, 'src/routes/device-data.js'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/services/vendor-analytics.js'), 'utf8');
  assert.match(route, /loadVendorTelemetryHistory/);
  assert.doesNotMatch(route, /listStoredTelemetry/);
  assert.match(route, /source: 'legacy-machine-telemetry'/);
  assert.match(service, /FROM vendor_device_telemetry vt/);
  assert.match(service, /LEFT JOIN machines m ON m\.vendor_device_id = vt\.vendor_device_id/);
});

test('canonical telemetry history maps to the existing device-data response contract', () => {
  const row = mapVendorTelemetryHistoryRow({
    id: '12',
    captured_at: '2026-11-03T09:00:00.000Z',
    created_at: '2026-11-03T09:00:01.000Z',
    machine_id: 'machine-1',
    machine_serial: 'SERIAL-1',
    vendor_device_id: '52',
    vendor_device_name: 'CR-30S_QX2026124',
    device_online_code: 2,
    cabin_temp_c: '28.5',
    humidity_pct: '0.45',
    real_time_weight_kg: '12.3',
    operating_status_code: 2,
    daily_input_t: '0.004',
    telemetry: { CabinTemp: 28.5 },
    input_data: { dailyInput: 0.004 },
    output_data: {},
  });
  assert.equal(row.recorded_at, '2026-11-03T09:00:00.000Z');
  assert.equal(row.machine_id, 'machine-1');
  assert.equal(row.device_key, '52');
  assert.equal(row.device_state, 2);
  assert.equal(row.cabin_temp_c, '28.5');
  assert.equal(row.daily_input_t, '0.004');
  assert.deepEqual(row.telemetry, { CabinTemp: 28.5 });
  assert.equal(row.source, 'vendor_device_telemetry');
});

test('graphs read telemetry while reports use daily metrics and only supplemental temperature/humidity', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'src/routes/analytics.js'), 'utf8');
  assert.match(source, /const sourceGroupBy = groupBy === 'hour' \? 'hour' : 'day';/);
  assert.match(source, /groupBy: sampleGroupBy/);
  assert.match(source, /loadGraphAnalytics\(context, range, sourceGroupBy\)/);
  assert.match(source, /loadReportAnalytics\(req, context, range\)/);
  assert.match(source, /reportTemperatureHumidityRows\(environmentRows, dailyResult\.snapshots\)/);
  const reportLoader = source.slice(
    source.indexOf('async function loadReportAnalytics'),
    source.indexOf('function forbiddenAccount')
  );
  assert.match(reportLoader, /groupBy: 'day'/);
  assert.match(source, /rows: \[\.\.\.dailyResult\.snapshots, \.\.\.supplementalRows\]/);
  const graphLoader = source.slice(
    source.indexOf('async function loadGraphAnalytics'),
    source.indexOf('async function loadReportAnalytics')
  );
  assert.doesNotMatch(graphLoader, /loadVendorDailyStatSnapshots/);
});

test('reports use the server collector credential so tenant roles share vendor daily data', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'src/routes/analytics.js'), 'utf8');
  const reportLoader = source.slice(
    source.indexOf('async function loadReportAnalytics'),
    source.indexOf('function forbiddenAccount')
  );
  assert.match(reportLoader, /loadCollectorCredentials\(\)/);
  assert.match(reportLoader, /collector\?\.accessToken \|\| await getVendorAccessToken/);
  assert.match(reportLoader, /refreshCollectorCredentials\(collector, token\)/);
  assert.match(reportLoader, /reportCredential: \{ status: collector \? 'collector' : 'session' \}/);
});

test('report temperature/humidity supplements only reported device days and cannot replace daily metrics', () => {
  const rows = reportTemperatureHumidityRows([
    {
      capturedAt: '2026-11-01T12:00:00+08:00',
      deviceId: '52',
      cabinTempC: 28,
      humidityPct: 41,
      wasteKg: 99,
      energyKwh: 99,
    },
    {
      capturedAt: '2026-11-02T12:00:00+08:00',
      deviceId: '52',
      cabinTempC: 30,
      humidityPct: 45,
      wasteKg: 88,
      energyKwh: 88,
    },
  ], [
    { capturedAt: '2026-11-01T12:00:00+08:00', deviceId: '52', wasteKg: 5, energyKwh: 1.5 },
  ]);

  assert.deepEqual(rows, [{
    capturedAt: '2026-11-01T12:00:00+08:00',
    deviceId: '52',
    cabinTempC: 28,
    humidityPct: 41,
  }]);
});

test('graph and report responses allow only short private browser caching', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'src/routes/analytics.js'), 'utf8');
  assert.match(source, /private, max-age=60, must-revalidate/);
  assert.match(source, /Vary: 'Cookie, Origin'/);
  assert.match(source, /ANALYTICS_CACHE_HEADERS/);
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
