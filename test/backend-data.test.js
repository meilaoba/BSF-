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
  assert.equal(snapshot.devices[0].operatingStatus, 'Standby');
  assert.equal(snapshot.devices[0].fermentState, 'Running');
  assert.equal(snapshot.devices[0].status, 'standby');
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

test('maps confirmed deviceOnline codes and humidity display scale', () => {
  sandbox.window.BSF_RUNTIME_CONFIG = { humidityScale: 100 };
  const snapshot = buildSnapshot([], [{
    id: 'vendor-201',
    serialNumber: 'SERIAL-201',
    deviceName: 'Running Unit',
    onlineCode: 2,
    telemetry: { CabinTemp: 40, Humidity: 0.2, RealTimeWeight: 12, OperatingStatus: 2 }
  }], []);
  assert.equal(snapshot.devices[0].status, 'running');
  assert.equal(snapshot.devices[0].humidity, 20);
  sandbox.window.BSF_RUNTIME_CONFIG = {};
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

test('maps vendor history points without inventing fields the vendor did not return', () => {
  const historyRow = sandbox.window.BSF_BACKEND_DATA.historyRow;
  const row = historyRow(
    { recordedAt: '2026-10-10', temperature: 43.2, humidity: 55 },
    { id: 'KW-100', status: 'standby', operatingStatus: 'Standby', fermentState: 'Running', vendorDeviceId: 'vendor-100' },
    'day'
  );
  assert.equal(row.device, 'KW-100');
  assert.equal(row.temperature, 43.2);
  assert.equal(row.humidity, 55);
  assert.equal(row.weight, '—');
  assert.equal(row.hotPlateTemp, '—');
  assert.equal(row.energy, '—');
  assert.equal(row.history, true);
});

test('merges history and live rows by device and timestamp with live data taking precedence', () => {
  const mergeRows = sandbox.window.BSF_BACKEND_DATA.mergeRows;
  const history = [{
    device: 'KW-100',
    recordedAt: '2026-10-10 10:00:00',
    sourceTimestampSeconds: 1791626400,
    temperature: '43.2',
    weight: '—'
  }];
  const live = [{
    device: 'KW-100',
    recordedAt: '2026-10-10 10:00:00',
    sourceTimestampSeconds: 1791626400,
    temperature: '43.2',
    weight: '12.4'
  }, {
    device: 'KW-100',
    recordedAt: '2026-10-10 11:00:00',
    sourceTimestampSeconds: 1791630000,
    temperature: '44.1',
    weight: '12.8'
  }];
  const merged = mergeRows(history, live);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].recordedAt, '2026-10-10 11:00:00');
  assert.equal(merged.find((row) => row.recordedAt === '2026-10-10 10:00:00').weight, '12.4');
});

test('appends newer records, updates the same timestamp, and keeps older history', () => {
  const appendRows = sandbox.window.BSF_BACKEND_DATA.appendRows;
  const existing = [
    { device: 'KW-100', recordedAt: '2026-10-10 10:00:00', sourceTimestampSeconds: 1791626400, temperature: '43.2', volatile: false },
    { device: 'KW-100', recordedAt: '2026-10-10 11:00:00', sourceTimestampSeconds: 1791630000, temperature: '44.1', volatile: false }
  ];
  const incoming = [
    { device: 'KW-100', recordedAt: '2026-10-10 11:00:00', sourceTimestampSeconds: 1791630000, temperature: '44.8', volatile: false },
    { device: 'KW-100', recordedAt: '2026-10-10 12:00:00', sourceTimestampSeconds: 1791633600, temperature: '45.3', volatile: false }
  ];

  const merged = appendRows(existing, incoming);
  assert.equal(merged.length, 3);
  assert.equal(merged.filter((row) => row.recordedAt === '2026-10-10 11:00:00').length, 1);
  assert.equal(merged.find((row) => row.recordedAt === '2026-10-10 11:00:00').temperature, '44.8');
  assert.equal(merged.find((row) => row.recordedAt === '2026-10-10 10:00:00').temperature, '43.2');
});

test('updates one realtime sample within a refresh bucket', () => {
  const appendRows = sandbox.window.BSF_BACKEND_DATA.appendRows;
  const existing = [{
    device: 'KW-100',
    recordedAt: '2026-10-10 10:00:00',
    receivedAtSeconds: 1791626400,
    sourceTimestampSeconds: 0,
    deviceState: 'Running',
    temperature: '43.2',
    humidity: '51',
    weight: '8.2',
    volatile: true
  }];
  const unchanged = {
    device: 'KW-100',
    recordedAt: '2026-10-10 10:02:00',
    receivedAtSeconds: 1791626520,
    sourceTimestampSeconds: 0,
    deviceState: 'Running',
    temperature: '43.2',
    humidity: '51',
    weight: '8.2',
    volatile: true
  };
  const changed = { ...unchanged, recordedAt: '2026-10-10 10:03:00', receivedAtSeconds: 1791626580, temperature: '44.0' };

  const merged = appendRows(existing, [changed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].temperature, '44.0');
  assert.equal(merged[0].receivedAtSeconds, 1791626580);
  assert.equal(appendRows(existing, [unchanged]).length, 1);
});

test('keeps a new realtime sample in the next refresh bucket even when values are unchanged', () => {
  const appendRows = sandbox.window.BSF_BACKEND_DATA.appendRows;
  const existing = [{
    device: 'KW-100',
    recordedAt: '2026-10-10 10:00:00',
    receivedAtSeconds: 1791626400,
    sourceTimestampSeconds: 0,
    temperature: '43.2',
    humidity: '51',
    weight: '8.2',
    volatile: true
  }];
  const nextSample = {
    device: 'KW-100',
    recordedAt: '2026-10-10 10:10:00',
    receivedAtSeconds: 1791627000,
    sourceTimestampSeconds: 0,
    temperature: '43.2',
    humidity: '51',
    weight: '8.2',
    volatile: true
  };

  const merged = appendRows(existing, [nextSample]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].recordedAt, '2026-10-10 10:10:00');
});

test('places a timestamp-less live row before older history using its receipt time', () => {
  const appendRows = sandbox.window.BSF_BACKEND_DATA.appendRows;
  const olderHistory = {
    device: 'KW-100',
    recordedAt: '2026-10-10 10:00:00',
    sourceTimestampSeconds: 1791626400,
    receivedAtSeconds: 1791626400,
    temperature: '43.2',
    volatile: false
  };
  const liveOnTop = {
    device: 'KW-100',
    recordedAt: '2026-10-10 17:00:00',
    sourceTimestampSeconds: 0,
    receivedAtSeconds: 1791651600,
    temperature: '45.1',
    volatile: true
  };

  const merged = appendRows([olderHistory], [liveOnTop]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].temperature, '45.1');
  assert.equal(merged[1].temperature, '43.2');
});

test('preserves every vendor telemetry field required by the full device view', () => {
  const telemetry = {
    TotalAddMaterial: 0.1,
    FermentState: 0,
    RunTime: 2,
    Shredder: 0,
    Zipper: 1,
    Discharge: 0,
    SingleAddMaterial: 0.2,
    OperatingStatus: 1,
    Fan: 0,
    HotPlateTemp: 38.2,
    MixingMotor: 0,
    Humidity: 0.2,
    SingleDischarge: 2.6,
    TotalDischarge: 0,
    CabinTemp: 40,
    RealTimeWeight: 10.8,
    Feed: 0
  };
  const snapshot = buildSnapshot([], [{
    id: 'vendor-300',
    serialNumber: 'SERIAL-300',
    deviceName: 'Complete Unit',
    deviceType: 25,
    templateName: 'Mitsubishi_SS_CZ',
    addressCode: '2',
    owner: { id: '1', userName: 'admin' },
    power: 2.5,
    onlineCode: 1,
    realtime: true,
    lastSyncedAt: '2026-10-27T05:14:46.078Z',
    telemetry
  }], []);

  assert.equal(snapshot.devices.length, 1);
  assert.deepEqual({ ...snapshot.devices[0].telemetry }, telemetry);
  assert.equal(snapshot.devices[0].realTimeWeight, 10.8);
  assert.equal(snapshot.devices[0].totalAddMaterial, 100);
  assert.equal(snapshot.devices[0].runTime, 2);
  assert.equal(snapshot.devices[0].vendorDeviceType, 25);
  assert.equal(snapshot.devices[0].vendorTemplateName, 'Mitsubishi_SS_CZ');
  assert.equal(snapshot.devices[0].vendorAddressCode, '2');
  assert.equal(snapshot.devices[0].vendorOwnerName, 'admin');
  assert.equal(snapshot.devices[0].vendorPower, 2.5);
  assert.equal(snapshot.devices[0].hotPlateTemp, 38.2);
  assert.equal(snapshot.devices[0].signal, null);
  assert.equal(snapshot.devices[0].vendorRealtime, true);
  assert.equal(snapshot.devices[0].vendorLastSyncedAt, '2026-10-27T05:14:46.078Z');
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rows[0].weight, 10.8);
  assert.equal(snapshot.rows[0].temperature, 40);
  assert.equal(snapshot.rows[0].hotPlateTemp, 38.2);
  assert.equal(snapshot.rows[0].totalAddMaterial, 100);
  assert.equal(snapshot.rows[0].singleAddMaterial, 0.2);
  assert.equal(snapshot.rows[0].singleDischarge, 2.6);
  assert.equal(snapshot.rows[0].runTime, 2);
  assert.equal(snapshot.rows[0].operatingStatus, 'Standby');
});

test('maps scheduled raw samples to the compact six-column contract with real fields only', () => {
  const rawSampleRow = sandbox.window.BSF_BACKEND_DATA.rawSampleRow;
  const row = rawSampleRow({
    id: 'sample-1',
    deviceId: 'vendor-300',
    capturedAt: '2026-10-28T14:58:46+08:00',
    normalized: {
      cabinTempC: 40.9,
      humidityPct: 0.2,
      realTimeWeightKg: 10.8,
      operatingStatusCode: 1
    },
    telemetry: {
      HotPlateTemp: 38.7,
      TotalAddMaterial: 0.1,
      TotalDischarge: 0,
      RunTime: 2
    }
  }, {
    id: 'KW-300',
    vendorDeviceId: 'vendor-300',
    status: 'standby'
  });

  assert.equal(row.recordedAt, '2026-10-28 14:58:46');
  assert.equal(row.device, 'KW-300');
  assert.equal(row.deviceState, 'Standby');
  assert.equal(row.weight, 10.8);
  assert.equal(row.temperature, 40.9);
  assert.equal(row.humidity, 0.2);
  assert.equal(row.totalAddMaterial, 100);
  assert.equal(row.hotPlateTemp, 38.7);
  assert.equal(row.network, 'Scheduled collector');
});

test('leaves missing raw sample fields empty instead of fabricating values', () => {
  const rawSampleRow = sandbox.window.BSF_BACKEND_DATA.rawSampleRow;
  const row = rawSampleRow({
    deviceId: 'vendor-301',
    capturedAt: '2026-10-28T14:50:00+08:00',
    normalized: { operatingStatusCode: 1 },
    telemetry: {}
  }, { id: 'KW-301', vendorDeviceId: 'vendor-301' });

  assert.equal(row.weight, '—');
  assert.equal(row.temperature, '—');
  assert.equal(row.humidity, '—');
  assert.equal(row.hotPlateTemp, '—');
  assert.equal(row.totalAddMaterial, '—');
});
