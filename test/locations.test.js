import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/locations.js'), 'utf8');
const sandbox = { window:{}, console, Intl, URL, encodeURIComponent };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename:'locations.js' });

const devices = [
  { id:'KW-001', name:'Main Bin', client:'Harbour View Hotel', status:'running', lat:22.3, lng:114.2 },
  { id:'KW-002', name:'Kitchen Bin', client:'Harbour View Hotel', status:'standby', lat:22.31, lng:114.21 },
  { id:'KW-003', name:'CIC Bin', client:'CIC Zero Carbon Park', status:'offline', lat:null, lng:null },
];

test('client, status and search use AND logic', () => {
  Object.assign(sandbox, { devices, filters:{ client:'Harbour View Hotel', status:'standby', search:'KW-002' } });
  const filtered = vm.runInContext('filterLocationDevices(devices, filters)', sandbox);
  assert.deepEqual(filtered.map((device) => device.id), ['KW-002']);

  sandbox.filters = { client:'Harbour View Hotel', status:'running', search:'KW-002' };
  const empty = vm.runInContext('filterLocationDevices(devices, filters)', sandbox);
  assert.equal(empty.length, 0);
});

test('locations uses only running, standby and offline statuses', () => {
  assert.equal(vm.runInContext("locationStatusValue('online')", sandbox), 'offline');
  assert.equal(vm.runInContext("locationStatusValue('running')", sandbox), 'running');
  assert.equal(vm.runInContext("locationStatusValue('standby')", sandbox), 'standby');
  assert.match(source, /\['', 'running', 'standby', 'offline'\]/);
  assert.doesNotMatch(source, />Online</);
});

test('search updates the result area without recreating the input', () => {
  const start = source.indexOf('function setLocationSearch');
  const end = source.indexOf('function filterLocationDevices', start);
  const block = source.slice(start, end);
  assert.match(block, /renderLocationFilterResults/);
  assert.doesNotMatch(block, /renderLocations/);
});

test('all status restores devices matching the other filters', () => {
  sandbox.filters = { client:'Harbour View Hotel', status:'', search:'' };
  const filtered = vm.runInContext('filterLocationDevices(devices, filters)', sandbox);
  assert.deepEqual(filtered.map((device) => device.id), ['KW-001', 'KW-002']);
});

test('CIC location uses only the confirmed coordinates and map link', () => {
  const profile = vm.runInContext('locationProfile(devices[2])', sandbox);
  assert.equal(profile.lat, 22.32408856041477);
  assert.equal(profile.lng, 114.20885238603694);
  assert.equal(profile.address, '86C5+CG  九龍灣');
  assert.equal(profile.mapsUrl, 'https://maps.app.goo.gl/vpC1AqB7YQZvWmch7');
  assert.equal(profile.poweredBy, 'iBrain Tech');
});

test('other devices without coordinates remain unpositioned instead of using fake markers', () => {
  sandbox.device = { client:'Client A', lat:null, lng:null };
  const profile = vm.runInContext('locationProfile(device)', sandbox);
  assert.equal(profile.lat, null);
  assert.equal(profile.lng, null);
  assert.equal(profile.mapsUrl, '');
});
