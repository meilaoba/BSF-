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
  { id:'KW-001', name:'Main Bin', client:'Harbour View Hotel', status:'online', lat:22.3, lng:114.2 },
  { id:'KW-002', name:'Kitchen Bin', client:'Harbour View Hotel', status:'offline', lat:22.31, lng:114.21 },
  { id:'KW-003', name:'CIC Bin', client:'CIC Zero Carbon Park', status:'offline', lat:null, lng:null },
];

test('client, status and search use AND logic', () => {
  Object.assign(sandbox, { devices, filters:{ client:'Harbour View Hotel', status:'offline', search:'KW-002' } });
  const filtered = vm.runInContext('filterLocationDevices(devices, filters)', sandbox);
  assert.deepEqual(filtered.map((device) => device.id), ['KW-002']);

  sandbox.filters = { client:'Harbour View Hotel', status:'online', search:'KW-002' };
  const empty = vm.runInContext('filterLocationDevices(devices, filters)', sandbox);
  assert.equal(empty.length, 0);
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
