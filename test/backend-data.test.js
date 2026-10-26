import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/backend-data.js'), 'utf8');
const sandbox = { window: {}, console };
vm.runInNewContext(source, sandbox, { filename: 'backend-data.js' });
const buildSnapshot = sandbox.window.BSF_BACKEND_DATA.buildSnapshot;

test('maps vendor API values onto an explicitly linked machine without auto-assignment', () => {
  const snapshot = buildSnapshot(
    [{
      id: '11111111-1111-4111-8111-111111111111',
      device_id: 'KW-100',
      serial: 'SERIAL-100',
      name: 'Kitchen Unit',
      client_id: '22222222-2222-4222-8222-222222222222',
      client_name: 'Client A',
      vendor_device_id: 'vendor-100',
      latitude: 22.3,
      longitude: 114.2,
      status: 'active'
    }],
    [{
      id: 'vendor-100',
      serialNumber: 'SERIAL-100',
      deviceName: 'Vendor Unit',
      onlineCode: 1,
      telemetry: {
        timestamp: 1791608608,
        CabinTemp: 45.5,
        Humidity: 51,
        RealTimeWeight: 8.2,
        OperatingStatus: 1,
        FermentState: 1
      }
    }],
    []
  );

  assert.equal(snapshot.devices.length, 1);
  assert.equal(snapshot.devices[0].client, 'Client A');
  assert.equal(snapshot.devices[0].backendId, '11111111-1111-4111-8111-111111111111');
  assert.equal(snapshot.devices[0].containerTemp, 45.5);
  assert.equal(snapshot.devices[0].realTimeWeight, 8.2);
  assert.equal(snapshot.devices[0].network, 'Vendor API');
  assert.equal(snapshot.rows.length, 1);
});

test('keeps unbound vendor devices visible without inventing a client link', () => {
  const snapshot = buildSnapshot([], [{
    id: 'vendor-200',
    serialNumber: 'SERIAL-200',
    deviceName: 'Unbound Unit',
    onlineCode: 0,
    telemetry: { CabinTemp: 20, Humidity: 40 }
  }], []);

  assert.equal(snapshot.devices.length, 1);
  assert.equal(snapshot.devices[0].client, 'Unassigned');
  assert.equal(snapshot.devices[0].status, 'offline');
});

test('deduplicates a stored and live row with the same device timestamp', () => {
  const machine = {
    id: '11111111-1111-4111-8111-111111111111',
    device_id: 'KW-100',
    serial: 'SERIAL-100',
    client_name: 'Client A',
    vendor_device_id: 'vendor-100',
    status: 'active'
  };
  const snapshot = buildSnapshot(
    [machine],
    [{
      id: 'vendor-100',
      serialNumber: 'SERIAL-100',
      onlineCode: 1,
      telemetry: { timestamp: 1791608608, CabinTemp: 45.5, Humidity: 51 }
    }],
    [{
      id: 1,
      machine_id: machine.id,
      vendor_device_id: 'vendor-100',
      device_state: 1,
      recorded_at: '2026-10-10T05:03:28.000Z',
      received_at: '2026-10-10T05:03:29.000Z',
      cabin_temp_c: 45.5,
      humidity_pct: 51
    }]
  );

  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rows[0].network, 'Vendor API');
});
