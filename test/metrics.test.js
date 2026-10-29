import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateTelemetrySnapshots,
  bucketKeys,
  energyForStandbyDays,
  fertilizerKg,
  FIXED_DAILY_ADJUSTMENT,
  ghgReducedKg,
  hongKongDateKey,
  periodRange,
  regionalEnergyFactor,
} from '../src/shared/metrics.js';

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('uses Hong Kong dates and preserves the full time axis', () => {
  const atHongKongMidnight = new Date('2026-10-31T16:30:00.000Z');
  assert.equal(hongKongDateKey(atHongKongMidnight), '2026-11-01');
  assert.deepEqual(periodRange({ period: 'monthly', now: atHongKongMidnight }), {
    start: '2026-11-01',
    end: '2026-11-30',
    groupBy: 'day',
  });
  assert.deepEqual(periodRange({ period: 'yearly', year: 2026 }), {
    start: '2026-01-01',
    end: '2026-12-31',
    groupBy: 'month',
  });
  assert.equal(bucketKeys('hour', '2026-11-01', '2026-11-01').length, 24);
  assert.equal(bucketKeys('day', '2026-11-01', '2026-11-30').length, 30);
  assert.equal(bucketKeys('month', '2026-01-01', '2026-12-31').length, 12);
});

test('applies the confirmed GHG, fertilizer and standby energy formulas', () => {
  assert.equal(regionalEnergyFactor('港岛'), 0.71);
  assert.equal(regionalEnergyFactor('港島'), 0.71);
  assert.equal(regionalEnergyFactor('non-hk'), 0.37);
  assert.equal(energyForStandbyDays(3), 4.5);
  assert.equal(fertilizerKg(125), 15);
  close(ghgReducedKg(10, 2, 'hk', 1), 10 * 1.5 - 2 * 0.71 - FIXED_DAILY_ADJUSTMENT);
  close(ghgReducedKg(10, 2, 'non-hk', 1), 10 * 1.5 - 2 * 0.37 - FIXED_DAILY_ADJUSTMENT);
});

test('formula settings can be overridden without changing code', () => {
  const formula = {
    wasteReductionFactor: 2,
    energyFactorHkIsland: 0.5,
    energyFactorOther: 0.25,
    transportConstant: 2,
    transportMonths: 10,
    transportDays: 300,
    fertilizerRatio: 0.1,
    standbyEnergyKwh: 2,
    humidityScale: 100,
  };
  assert.equal(regionalEnergyFactor('hk', formula), 0.5);
  assert.equal(regionalEnergyFactor('non-hk', formula), 0.25);
  assert.equal(energyForStandbyDays(3, formula), 6);
  assert.equal(fertilizerKg(100, formula), 10);
  close(
    ghgReducedKg(10, 2, 'hk', 1, formula),
    10 * 2 - 2 * 0.5 - (2 * 10) / 300
  );
  const result = aggregateTelemetrySnapshots([
    {
      capturedAt: '2026-10-01T02:00:00.000Z',
      deviceId: 'device-a',
      dailyInputT: 0.01,
      operatingStatusCode: 1,
      humidityPct: 0.2,
    },
  ], {
    groupBy: 'day',
    start: '2026-10-01',
    end: '2026-10-01',
    summaryMode: 'daily',
    now: new Date('2026-10-02T00:00:00.000Z'),
    formula,
  });
  close(result.summary.avgHumidityPct, 20);
});

test('aggregates only real snapshots and emits nulls for missing and future buckets', () => {
  const now = new Date('2026-10-02T06:30:00.000Z');
  const result = aggregateTelemetrySnapshots([
    {
      capturedAt: '2026-10-01T02:00:00.000Z',
      deviceId: 'device-a',
      dailyInputT: 0.01,
      monthlyInputT: 0.1,
      yearlyInputT: 1,
      operatingStatusCode: 1,
      cabinTempC: 40,
      humidityPct: 50,
    },
    {
      capturedAt: '2026-10-01T05:00:00.000Z',
      deviceId: 'device-a',
      dailyInputT: 0.02,
      monthlyInputT: 0.1,
      yearlyInputT: 1,
      operatingStatusCode: 2,
      cabinTempC: 42,
      humidityPct: 52,
    },
    {
      capturedAt: '2026-10-02T02:00:00.000Z',
      deviceId: 'device-b',
      dailyInputT: 0.03,
      monthlyInputT: 0.2,
      yearlyInputT: 2,
      operatingStatusCode: 2,
      cabinTempC: 44,
      humidityPct: 54,
    },
    {
      capturedAt: '2026-10-02T08:00:00.000Z',
      deviceId: 'device-a',
      dailyInputT: 99,
      monthlyInputT: 99,
      yearlyInputT: 99,
      operatingStatusCode: 2,
    },
  ], {
    groupBy: 'day',
    start: '2026-10-01',
    end: '2026-10-03',
    region: 'hk',
    summaryMode: 'monthly',
    now,
  });

  assert.deepEqual(result.items.map((item) => item.value), [20, 30, null]);
  assert.deepEqual(result.tempItems.map((item) => item.value), [41, 44, null]);
  assert.equal(result.summary.wasteKg, 300);
  assert.equal(result.summary.standbyDeviceDays, 1);
  assert.equal(result.summary.energyKwh, 1.5);
  assert.equal(result.summary.fertilizerKg, 36);
  close(result.summary.ghgKg, 300 * 1.5 - 1.5 * 0.71 - FIXED_DAILY_ADJUSTMENT * 2);
});

test('converts cumulative daily input into hourly increments without duplicating a day', () => {
  const result = aggregateTelemetrySnapshots([
    { capturedAt: '2026-10-01T02:10:00.000Z', deviceId: 'device-a', dailyInputT: 0.010, operatingStatusCode: 1 },
    { capturedAt: '2026-10-01T03:10:00.000Z', deviceId: 'device-a', dailyInputT: 0.015, operatingStatusCode: 2 },
    { capturedAt: '2026-10-01T04:10:00.000Z', deviceId: 'device-a', dailyInputT: 0.018, operatingStatusCode: 2 },
  ], {
    groupBy: 'hour',
    start: '2026-10-01',
    end: '2026-10-01',
    region: 'non-hk',
    summaryMode: 'daily',
    now: new Date('2026-10-01T05:30:00.000Z'),
  });

  assert.equal(result.items[10].value, 10);
  assert.equal(result.items[11].value, 5);
  assert.equal(result.items[12].value, 3);
  assert.equal(result.items[13].value, null);
  assert.equal(result.summary.wasteKg, 18);
  assert.equal(result.summary.energyKwh, 1.5);
});

test('returns friendly empty metrics when no snapshots exist', () => {
  const result = aggregateTelemetrySnapshots([], {
    groupBy: 'month',
    start: '2026-01-01',
    end: '2026-12-31',
    summaryMode: 'yearly',
    now: new Date('2026-10-28T00:00:00.000Z'),
  });
  assert.equal(result.items.length, 12);
  assert.ok(result.items.every((item) => item.value === null));
  assert.equal(result.summary.pointCount, 0);
  assert.equal(result.summary.wasteKg, null);
  assert.equal(result.summary.ghgKg, null);
  assert.equal(result.summary.fertilizerKg, null);
});
test('frontend and backend analytics modules stay in sync', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  assert.equal(
    fs.readFileSync(path.join(root, 'backend/src/shared/metrics.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'src/shared/metrics.js'), 'utf8')
  );
});
