import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const { normalizeGhgConfiguration } = await import('../src/routes/settings.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('normalizes a device-level GHG configuration', () => {
  assert.deepEqual(normalizeGhgConfiguration({
    vendorDeviceId:'501',
    region:'hk',
    solar:false,
    monthlyDistanceKm:140,
  }), {
    machineId:null,
    vendorDeviceId:'501',
    region:'hk',
    solar:false,
    monthlyDistanceKm:140,
  });
});

test('rejects incomplete or invalid GHG configuration', () => {
  assert.throws(
    () => normalizeGhgConfiguration({ vendorDeviceId:'501', region:'hk', solar:false }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.throws(
    () => normalizeGhgConfiguration({
      vendorDeviceId:'501',
      region:'other',
      solar:false,
      monthlyDistanceKm:140,
    }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.throws(
    () => normalizeGhgConfiguration({
      vendorDeviceId:'501',
      region:'hk',
      solar:false,
      monthlyDistanceKm:-1,
    }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
});

test('GHG settings persist locally and never call a vendor write endpoint', () => {
  const source = fs.readFileSync(path.join(root, 'src/routes/settings.js'), 'utf8');
  assert.match(source, /router\.put\('\/api\/v1\/settings\/ghg'/);
  assert.match(source, /role !== 'master_admin'/);
  assert.match(source, /UPDATE machines/);
  assert.match(source, /machine\.ghg_configuration\.update/);
  assert.doesNotMatch(source, /addVendor|user\/add|device\/add/);
});
