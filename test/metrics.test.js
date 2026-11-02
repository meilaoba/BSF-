import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateTelemetrySnapshots,
  averageDailyDistanceKm,
  bucketKeys,
  electricityCarbonKg,
  energyForStandbyDays,
  fertilizerKg,
  FIXED_DAILY_ADJUSTMENT,
  ghgReducedKg,
  hongKongDateKey,
  machineCarbonKg,
  periodRange,
  regionalEnergyFactor,
  transportCarbonKg,
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
  assert.equal(electricityCarbonKg(2, 'non-hk'), 0.74);
  close(transportCarbonKg(null), FIXED_DAILY_ADJUSTMENT);
  close(machineCarbonKg(2, 'non-hk'), 0.74 + FIXED_DAILY_ADJUSTMENT);
  close(ghgReducedKg(10, 2, 'hk', 1), 10 * 1.5 - 2 * 0.71 - FIXED_DAILY_ADJUSTMENT);
  close(ghgReducedKg(10, 2, 'non-hk', 1), 10 * 1.5 - 2 * 0.37 - FIXED_DAILY_ADJUSTMENT);
});

test('transport formula accepts confirmed distance and fuel parameters when configured', () => {
  const formula = {
    monthlyDistanceKm: 140,
    transportMonths: 12,
    transportDays: 365,
    fuelConsumptionLPer100Km: 8.3,
    fuelEmissionFactorKgPerL: 2.32,
  };
  const expectedDistance = (140 * 12) / 365;
  assert.ok(Math.abs(averageDailyDistanceKm(formula) - expectedDistance) <= 1e-9);
  const expectedTransport = (expectedDistance / 100) * 8.3 * 2.32;
  close(transportCarbonKg(null, 1, formula), expectedTransport);
  close(
    ghgReducedKg(2, 1.5, 'non-hk', 1, formula),
    2 * 1.5 - 1.5 * 0.37 - expectedTransport
  );
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
  assert.equal(result.summary.wasteKg, 50);
  assert.equal(result.summary.standbyDeviceDays, 1);
  assert.equal(result.summary.operatingDeviceDays, 2);
  assert.equal(result.summary.energyKwh, 3);
  assert.equal(result.summary.fertilizerKg, 6);
  close(
    result.summary.ghgKg,
    (20 * 1.5 - 1.5 * 0.71 - FIXED_DAILY_ADJUSTMENT)
      + (30 * 1.5 - 1.5 * 0.71 - FIXED_DAILY_ADJUSTMENT)
  );
});

test('monthly and yearly results sum per-device daily values and retain negative GHG', () => {
  const result = aggregateTelemetrySnapshots([
    { capturedAt:'2026-01-01T03:00:00Z', deviceId:'device-a', dailyInputT:0, operatingStatusCode:1 },
    { capturedAt:'2026-01-02T03:00:00Z', deviceId:'device-a', dailyInputT:0.01, operatingStatusCode:1 },
    { capturedAt:'2026-02-01T03:00:00Z', deviceId:'device-b', dailyInputT:0.02, operatingStatusCode:2 },
  ], {
    groupBy:'month',
    start:'2026-01-01',
    end:'2026-12-31',
    region:'non-hk',
    summaryMode:'yearly',
    now:new Date('2026-02-15T00:00:00Z'),
  });
  assert.equal(result.items[0].value, 10);
  assert.equal(result.items[1].value, 20);
  assert.equal(result.summary.wasteKg, 30);
  assert.equal(result.summary.energyKwh, 4.5);
  close(result.summary.fertilizerKg, 3.6);
  const januaryGhg = -1.5 * 0.37 - FIXED_DAILY_ADJUSTMENT
    + 10 * 1.5 - 1.5 * 0.37 - FIXED_DAILY_ADJUSTMENT;
  const februaryGhg = 20 * 1.5 - 1.5 * 0.37 - FIXED_DAILY_ADJUSTMENT;
  close(result.ghgItems[0].value, januaryGhg);
  close(result.ghgItems[1].value, februaryGhg);
  close(result.summary.ghgKg, januaryGhg + februaryGhg);
});

test('applies per-site monthly mileage and signed operating-day electricity', () => {
  const result = aggregateTelemetrySnapshots([
    {
      capturedAt: '2026-10-01T02:00:00.000Z',
      deviceId: 'cic',
      dailyInputT: 0.002,
      operatingStatusCode: 2,
      clientRegion: 'non-hk',
      ghgFormula: { monthlyDistanceKm: 140, dailyElectricityKwh: 1.5 }
    },
    {
      capturedAt: '2026-10-01T02:00:00.000Z',
      deviceId: 'hsitp',
      dailyInputT: 0.002,
      operatingStatusCode: 2,
      clientRegion: 'non-hk',
      ghgFormula: { monthlyDistanceKm: 24, dailyElectricityKwh: -1.5 }
    }
  ], {
    groupBy: 'day',
    start: '2026-10-01',
    end: '2026-10-01',
    summaryMode: 'daily',
    now: new Date('2026-10-02T00:00:00.000Z')
  });

  const cicTransport = ((140 * 12) / 365 / 100) * 8.3 * 2.32;
  const hsitpTransport = ((24 * 12) / 365 / 100) * 8.3 * 2.32;
  close(result.summary.wasteKg, 4);
  close(result.summary.energyKwh, 0);
  close(result.summary.ghgKg,
    (2 * 1.5 - 1.5 * 0.37 - cicTransport)
      + (2 * 1.5 + 1.5 * 0.37 - hsitpTransport));
});

test('daily aggregate rows use vendor waste and measured power instead of estimates', () => {
  const result = aggregateTelemetrySnapshots([
    {
      capturedAt: '2026-10-16T12:00:00+08:00',
      deviceId: 'cic',
      wasteKg: 5,
      energyKwh: 1.5,
      runTimeHours: 1,
      operatingStatusCode: 2,
      dailyAggregate: true,
      clientRegion: 'non-hk',
      ghgFormula: { monthlyDistanceKm: 140, dailyElectricityKwh: 1.5 }
    }
  ], {
    groupBy: 'day',
    start: '2026-10-16',
    end: '2026-10-16',
    summaryMode: 'daily',
    now: new Date('2026-10-17T00:00:00.000Z')
  });
  const transport = ((140 * 12) / 365 / 100) * 8.3 * 2.32;
  assert.equal(result.summary.wasteKg, 5);
  assert.equal(result.summary.energyKwh, 1.5);
  close(result.summary.ghgKg, 5 * 1.5 - 1.5 * 0.37 - transport);
});

test('daily aggregate zero power suppresses legacy standby estimates for the same day', () => {
  const result = aggregateTelemetrySnapshots([
    {
      capturedAt: '2026-10-28T12:00:00+08:00',
      deviceId: 'cic',
      wasteKg: 0,
      energyKwh: 0,
      runTimeHours: 0,
      operatingStatusCode: 0,
      dailyAggregate: true
    },
    {
      capturedAt: '2026-10-28T12:00:00+08:00',
      deviceId: 'cic',
      dailyInputT: 0,
      operatingStatusCode: 1
    }
  ], {
    groupBy: 'day',
    start: '2026-10-28',
    end: '2026-10-28',
    summaryMode: 'daily',
    now: new Date('2026-10-29T00:00:00.000Z')
  });
  assert.equal(result.summary.energyKwh, 0);
});

test('daily aggregate zero is plotted once at noon without copying GHG forward', () => {
  const result = aggregateTelemetrySnapshots([
    {
      capturedAt: '2026-10-31T12:00:00+08:00',
      deviceId: 'cic',
      wasteKg: 0,
      energyKwh: 0,
      runTimeHours: 0,
      operatingStatusCode: 0,
      dailyAggregate: true,
      clientRegion: 'non-hk',
      ghgFormula: { monthlyDistanceKm: 140, dailyElectricityKwh: 1.5 },
    },
  ], {
    groupBy: 'hour',
    start: '2026-10-31',
    end: '2026-10-31',
    summaryMode: 'daily',
    now: new Date('2026-11-02T04:00:00.000Z'),
  });

  assert.equal(result.items[12].date, '2026-10-31 12:00');
  assert.equal(result.items[12].value, 0);
  assert.equal(result.energyItems[12].value, 0);
  assert.equal(result.summary.pointCount, 1);
  assert.equal(result.ghgItems[12].value, result.summary.ghgKg);
  assert.deepEqual(
    result.ghgItems
      .map((item, index) => item.value === null ? null : index)
      .filter((index) => index !== null),
    [12],
  );
});

test('hourly telemetry summaries keep hourly temperature points in the daily view', () => {
  const result = aggregateTelemetrySnapshots([
    { capturedAt: '2026-11-01T09:00:00+08:00', deviceId: '52', cabinTempC: 28, operatingStatusCode: 2, dailyInputT: 0.01 },
    { capturedAt: '2026-11-01T10:00:00+08:00', deviceId: '52', cabinTempC: 29, operatingStatusCode: 2, dailyInputT: 0.02 },
    { capturedAt: '2026-11-01T12:00:00+08:00', deviceId: '52', wasteKg: 0, energyKwh: 1.5, dailyAggregate: true, clientRegion: 'non-hk' },
  ], {
    groupBy: 'hour',
    start: '2026-11-01',
    end: '2026-11-01',
    summaryMode: 'daily',
    now: new Date('2026-11-02T04:00:00.000Z'),
  });

  assert.deepEqual(
    result.tempItems
      .filter((item) => item.value !== null)
      .map((item) => [item.date, item.value]),
    [['2026-11-01 09:00', 28], ['2026-11-01 10:00', 29]],
  );
  assert.equal(result.energyItems[12].value, 1.5);
});

test('daily view shows sampled input hours when vendor kitchen waste is zero', () => {
  const result = aggregateTelemetrySnapshots([
    { capturedAt: '2026-11-01T08:00:00+08:00', deviceId: '52', dailyInputT: 0.004, operatingStatusCode: 2 },
    { capturedAt: '2026-11-01T09:00:00+08:00', deviceId: '52', dailyInputT: 0.006, operatingStatusCode: 2 },
    { capturedAt: '2026-11-01T12:00:00+08:00', deviceId: '52', dailyInputT: 0.010, operatingStatusCode: 2 },
    { capturedAt: '2026-11-01T12:00:00+08:00', deviceId: '52', wasteKg: 0, energyKwh: 1.5, dailyAggregate: true, clientRegion: 'non-hk' },
  ], {
    groupBy: 'hour',
    start: '2026-11-01',
    end: '2026-11-01',
    summaryMode: 'daily',
    now: new Date('2026-11-02T04:00:00.000Z'),
  });

  assert.deepEqual(
    result.items
      .filter((item) => item.value !== null)
      .map((item) => [item.date.slice(11), item.value]),
    [['08:00', 4], ['09:00', 2], ['12:00', 4]],
  );
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
