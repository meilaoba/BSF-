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
  assert.match(source, /This Month GHG Reduced/);
  assert.match(source, /This Month Waste/);
  assert.match(source, /Est\. Fertilizer This Month/);
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

test('machines page uses only running, standby and offline device statuses', () => {
  assert.match(source, /Running/);
  assert.match(source, /Standby/);
  assert.match(source, /Offline/);
  assert.doesNotMatch(source, /status==='online'/);
  assert.doesNotMatch(source, />\s*Online\s*</);
});

test('machines metrics use one monthly graph request for daily and monthly cards', () => {
  assert.match(source, /getGraphs\(Object\.assign\(\{ period:'monthly' \}, identity\)\)/);
  assert.doesNotMatch(source, /getGraphs\(Object\.assign\(\{ period:'daily'/);
});
