import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('runtime business collections start empty', () => {
  const data = read('src/ui/data.js');
  assert.match(data, /const devices = \[\];/);
  assert.match(data, /const rawDataRows = \[\];/);
  assert.match(data, /const alerts = \[\];/);
});

test('frontend does not seed fabricated business records', () => {
  const frontendSources = [
    'src/ui/data.js',
    'src/ui/backend-data.js',
    'src/ui/pages/machines.js',
    'src/ui/pages/locations.js',
    'src/ui/pages/graphs.js',
    'src/ui/pages/raw-data.js',
    'src/ui/pages/reports.js',
    'src/ui/pages/alerts.js'
  ].map(read).join('\n');

  assert.doesNotMatch(frontendSources, /KW-00[1-9]|GreenCity|Harbour View|Metro Mall|Kitchen Waste Unit 00|Math\.random/);
});

test('production login has no demo authentication bypass', () => {
  const html = read('index.html');
  const router = read('src/ui/router.js');
  assert.doesNotMatch(html, /BSF_DEMO_MODE/);
  assert.doesNotMatch(router, /BSF_DEMO_MODE|demoRole/);
});
test('frontend and runtime contain no MQTT transport layer', () => {
  const files = [
    'index.html',
    'package.json',
    'src/app.js',
    'src/main.js',
    'src/config/runtime.js',
    'src/api/index.js',
    'src/api/backend.js',
    'src/services/device-service.js',
    'src/ui/backend-data.js',
    'src/ui/router.js',
    'src/ui/notifications.js',
    'src/ui/pages/api.js',
    'scripts/dev-server.mjs'
  ];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /mqtt|bms_mos|BSF_GATEWAY|BSF_LOAD_GATEWAY|\/api\/gateway/i);
  assert.doesNotMatch(source, /gatewayBaseUrl|MQTT Broker/i);
});

test('authenticated data bridge loads devices and telemetry from backend routes', () => {
  const source = read('src/ui/backend-data.js');
  assert.match(source, /BSF_LOAD_BACKEND_DATA/);
  assert.match(source, /BSF_LOAD_BACKEND_LATEST/);
  assert.match(source, /getMachines\(/);
  assert.match(source, /getVendorDevices\(/);
  assert.match(source, /getDeviceData\(/);
});
