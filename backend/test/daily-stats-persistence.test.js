import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { closePool } = await import('../src/db.js');
const {
  dailyStatSnapshot,
  dailyStatStorageRow,
  dailyStatsSyncStartDate,
  mergeDailyStatSnapshots,
  storedDailyStatSnapshot,
  vendorDailyStatsRefreshRange,
} = await import('../src/services/vendor-daily-stats-analytics.js');

test.after(async () => closePool());

test('daily stats persist raw vendor values and normalized business units', () => {
  const row = dailyStatStorageRow({
    statDate: '2026-11-24',
    runTime: 2.5,
    saveCarbon: 4.2,
    kitchenWaste: 8.5,
    powerConsume: 1.5,
    deviceLocation: '2',
    unloadingWeight: 3.2,
    bindingTime: 1789386531140,
  }, {
    id: '52',
    deviceName: 'CR-30S_QX2026124',
  });

  assert.equal(row.statDate, '2026-11-24');
  assert.equal(row.deviceName, 'CR-30S_QX2026124');
  assert.equal(row.kitchenWasteRaw, 8.5);
  assert.equal(row.kitchenWasteKg, 8.5);
  assert.equal(row.powerConsumeRaw, 1.5);
  assert.equal(row.vendorPowerConsumeKwh, 1.5);
  assert.equal(row.savedCarbonKg, 4.2);
  assert.equal(row.unloadingWeightRaw, 3.2);
  assert.equal(row.bindingTimeMs, 1789386531140);
});

test('stored daily stats remain audit data and never become business energy', () => {
  const snapshot = storedDailyStatSnapshot({
    vendor_device_id: '52',
    stat_date: '2026-11-24',
    kitchen_waste_raw: 8.5,
    kitchen_waste_kg: 99,
    power_consume_raw: 1.5,
    vendor_power_consume_kwh: 99,
    run_time_hours: 2.5,
  }, {
    clientRegion: 'non-hk',
    ghgFormula: { monthlyDistanceKm: 24 },
  });
  assert.equal(snapshot.wasteKg, 8.5);
  assert.equal(snapshot.vendorPowerConsumeKwh, 1.5);
  assert.equal(snapshot.energyKwh, null);
  assert.equal(snapshot.runTimeHours, 2.5);
  assert.equal(snapshot.clientRegion, 'non-hk');
});

test('stored history and live vendor rows merge by device and date', () => {
  const stored = [
    storedDailyStatSnapshot({
      vendor_device_id: '52',
      stat_date: '2026-09-01',
      kitchen_waste_kg: 7,
    }),
    storedDailyStatSnapshot({
      vendor_device_id: '52',
      stat_date: '2026-11-24',
      kitchen_waste_kg: 3,
    }),
  ];
  const live = [
    dailyStatSnapshot({
      statDate: '2026-11-24',
      kitchenWaste: 4,
      powerConsume: 1.5,
      runTime: 1,
    }, '52'),
  ];

  const merged = mergeDailyStatSnapshots(stored, live);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].statDate, '2026-09-01');
  assert.equal(merged[0].wasteKg, 7);
  assert.equal(merged[1].wasteKg, 4);
});

test('live vendor refresh is limited to the documented 60-day window', () => {
  const now = new Date('2026-11-24T12:00:00+08:00');
  assert.deepEqual(
    vendorDailyStatsRefreshRange('2026-01-01', '2026-12-31', now),
    { start: '2026-09-26', end: '2026-11-24' }
  );
  assert.equal(
    vendorDailyStatsRefreshRange('2026-01-01', '2026-08-31', now),
    null
  );
});

test('daily stats backfill older gaps and refresh a rolling recent window', () => {
  assert.equal(
    dailyStatsSyncStartDate(null, '2026-11-24'),
    '2026-09-26'
  );
  assert.equal(
    dailyStatsSyncStartDate('2026-11-23', '2026-11-24'),
    '2026-11-21'
  );
  assert.equal(
    dailyStatsSyncStartDate('2026-10-01', '2026-11-24'),
    '2026-09-26'
  );
});

test('daily stats migration stores history and guards the 30-minute sync cadence', () => {
  const sql = fs.readFileSync(
    path.join(root, 'db/migrations/018_vendor_daily_stats.sql'),
    'utf8'
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vendor_daily_stats/);
  assert.match(sql, /UNIQUE \(vendor_account_id, vendor_device_id, stat_date\)/);
  assert.match(sql, /vendor_daily_stats_account_date_idx/);
  assert.match(sql, /vendor_daily_stats_device_date_idx/);
  assert.match(sql, /vendor_daily_stats_sync_state/);
  assert.match(sql, /last_attempt_at/);
  assert.match(sql, /last_success_at/);
});

test('report loading uses stored daily stats before merging live vendor data', () => {
  const source = fs.readFileSync(path.join(root, 'src/routes/analytics.js'), 'utf8');
  const loader = source.slice(
    source.indexOf('async function loadReportAnalytics'),
    source.indexOf('function forbiddenAccount')
  );
  assert.match(loader, /loadStoredVendorDailyStats/);
  assert.match(loader, /vendorDailyStatsRefreshRange/);
  assert.match(loader, /loadVendorDailyStatSnapshots/);
  assert.match(loader, /persist: true/);
  assert.match(loader, /mergeDailyStatSnapshots\(storedDailyRows, liveDailyRows\)/);
  assert.match(loader, /using stored reports/);
});
