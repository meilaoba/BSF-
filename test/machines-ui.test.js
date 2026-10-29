import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/machines.js'), 'utf8');

test('machines page omits the raw vendor telemetry block', () => {
  assert.doesNotMatch(source, /Live Telemetry/i);
  assert.doesNotMatch(source, /live-telemetry/);
  assert.doesNotMatch(source, /renderVendorTelemetry/);
});

test('machines page keeps metric cards, device status and location preview', () => {
  assert.match(source, /machineMetricsMarkup/);
  assert.match(source, /Device Status/);
  assert.match(source, /Location Preview/);
});

test('machines page restores the original eight-metric layout', () => {
  assert.match(source, /Accumulated GHG Reduced/);
  assert.match(source, /Accumulated Waste/);
  assert.match(source, /Est\. Fertilizer/);
  assert.match(source, /Daily Waste/);
  assert.match(source, /Daily Energy/);
  assert.match(source, /Avg Env Temp/);
  assert.match(source, /Container Temp/);
  assert.match(source, /Container Humidity/);
  assert.doesNotMatch(source, /Hot Plate Temp/);
  assert.doesNotMatch(source, /Current Weight/);
  assert.doesNotMatch(source, /Total Added Material/);
  assert.doesNotMatch(source, /Total Discharged/);
});
