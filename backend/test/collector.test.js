import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  collectorBucketStart,
  collectorIntervalSeconds,
  collectorVendorAccountId,
} = await import('../src/services/vendor-collector.js');
const { closePool } = await import('../src/db.js');

test.after(async () => closePool());

test('collector attributes samples to the vendor account id, not the local user id', () => {
  assert.equal(collectorVendorAccountId({ user_id: 'local-uuid', vendor_user_id: '44' }), '44');
  assert.equal(collectorVendorAccountId({ vendorUserId: 52 }), '52');
  assert.equal(collectorVendorAccountId({ user_id: 'local-only' }), '');

  const source = fs.readFileSync(path.join(root, 'src/services/vendor-collector.js'), 'utf8');
  assert.match(source, /u\.vendor_user_id/);
  assert.doesNotMatch(source, /vendorAccountId:\s*account\.user_id/);
});

test('collector uses a dedicated encrypted credential instead of a short-lived browser session', () => {
  const source = fs.readFileSync(path.join(root, 'src/services/vendor-collector.js'), 'utf8');
  const session = fs.readFileSync(path.join(root, 'src/middleware/session.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'db/migrations/009_vendor_collector_credentials.sql'), 'utf8');

  assert.match(source, /vendor_collector_credentials/);
  assert.doesNotMatch(source, /FROM auth_sessions/);
  assert.doesNotMatch(source, /expires_at/);
  assert.match(session, /INSERT INTO vendor_collector_credentials/);
  assert.match(session, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.match(migration, /vendor_access_token_enc\s+TEXT NOT NULL/);
  assert.match(migration, /SELECT DISTINCT ON \(s\.user_id\)/);
});

test('collector applies the confirmed 30 minute vendor cadence', () => {
  assert.equal(collectorIntervalSeconds('master_admin', {}), 1800);
  assert.equal(collectorIntervalSeconds('client_admin', {}), 1800);
  assert.equal(collectorIntervalSeconds('user', {}), 1800);
});

test('collector buckets samples without depending on browser activity', () => {
  assert.equal(
    collectorBucketStart('2026-10-28T14:58:46+08:00', 600).toISOString(),
    '2026-10-28T06:50:00.000Z'
  );
  assert.equal(
    collectorBucketStart('2026-10-28T14:58:46+08:00', 180).toISOString(),
    '2026-10-28T06:57:00.000Z'
  );
});

test('collector migration records sample source, interval and query index', () => {
  const sql = fs.readFileSync(path.join(root, 'db/migrations/008_telemetry_collector_samples.sql'), 'utf8');
  assert.match(sql, /sample_source/);
  assert.match(sql, /sample_interval_seconds/);
  assert.match(sql, /sample_source IN \('request', 'worker'\)/);
  assert.match(sql, /vendor_device_telemetry_worker_time_idx/);
});

test('collector migration allows the confirmed 30 minute interval', () => {
  const sql = fs.readFileSync(path.join(root, 'db/migrations/011_vendor_collector_30minute_interval.sql'), 'utf8');
  assert.match(sql, /1800/);
  assert.match(sql, /vendor_device_telemetry_sample_interval_check/);
});
