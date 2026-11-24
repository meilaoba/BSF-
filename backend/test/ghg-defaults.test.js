import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { closePool } = await import('../src/db.js');
const { defaultGhgSettingsForDevice } = await import('../src/shared/ghg-defaults.js');
const { ghgReducedKg } = await import('../src/shared/metrics.js');

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test.after(async () => closePool());

test('CR-50S uses the 50KG HSITP formula from the supplied workbook', () => {
  const settings = defaultGhgSettingsForDevice({ deviceName: 'CR-50S_QX2026059' });
  assert.deepEqual(settings, {
    region: 'non-hk',
    ghgFormula: {
      monthlyDistanceKm: 24,
      solar: true,
    },
  });
  close(
    ghgReducedKg(2, 1.5, settings.region, 1, settings.ghgFormula),
    3.4030622465753426
  );
});

test('CR-30S uses the 30KG CIC formula from the supplied workbook', () => {
  const settings = defaultGhgSettingsForDevice({ deviceName: 'CR-30S_QX2026124' });
  assert.deepEqual(settings, {
    region: 'non-hk',
    ghgFormula: {
      monthlyDistanceKm: 140,
      solar: false,
    },
  });
  close(
    ghgReducedKg(2, 1.5, settings.region, 1, settings.ghgFormula),
    1.5586964383561646
  );
});

test('unknown machine models receive no invented formula', () => {
  assert.equal(defaultGhgSettingsForDevice({ deviceName: 'HCC-100KCX_QX2026005' }), null);
  assert.equal(defaultGhgSettingsForDevice({}), null);
});

test('analytics settings and graph rows load model defaults without a local Machine', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/vendor-analytics.js'), 'utf8');
  const dailyStats = fs.readFileSync(
    path.join(root, 'src/services/vendor-daily-stats-analytics.js'),
    'utf8'
  );
  assert.match(service, /defaultGhgSettingsForDevice/);
  assert.match(service, /LEFT JOIN vendor_devices vd/);
  assert.match(service, /\.\.\.\(defaults\.ghgFormula \|\| \{\}\)/);
  assert.match(dailyStats, /effectiveReportSettings/);
  assert.match(dailyStats, /deviceName: row\.vendor_device_name/);
});
