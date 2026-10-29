import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const { closePool } = await import('../src/db.js');
const {
  expandTelemetryPayload,
  mapTelemetryInput,
  parseTelemetryTimestamp,
  upsertVendorDevices,
} = await import('../src/services/device-data.js');

test.after(async () => closePool());

test('maps vendor API telemetry fields without coercing invalid values', () => {
  const mapped = mapTelemetryInput({
    machineId: '2d79ed41-a4d9-455a-b2d0-9783b02160c2',
    source: 'api',
    timestamp: 1769581200,
    deviceState: 1,
    data: {
      CabinTemp: '42.5',
      HotPlateTemp: 49.75,
      Humidity: 120,
      RealTimeWeight: '18.25',
      TotalAddMaterial: 6.053,
      SingleAddMaterial: 1.2,
      TotalDischarge: -3.2,
      SingleDischarge: -0.1,
      OperatingStatus: 'Running',
      FermentState: 'Fermenting',
      FermentRunTime: 120,
      RunTime: 15,
      Feed: 1,
      Fan: 0,
      CO2: 650,
      NO2: 0.08,
      H2S: 0.02,
      Signal: 85,
    },
  });

  assert.equal(mapped.machineId, '2d79ed41-a4d9-455a-b2d0-9783b02160c2');
  assert.equal(mapped.source, 'api');
  assert.equal(mapped.deviceState, 1);
  assert.equal(mapped.cabinTempC, 42.5);
  assert.equal(mapped.hotPlateTempC, 49.75);
  assert.equal(mapped.humidityPct, null);
  assert.equal(mapped.realTimeWeightKg, 18.25);
  assert.equal(mapped.totalAddedMaterialKg, 6053);
  assert.equal(mapped.singleAddedMaterialKg, 1.2);
  assert.equal(mapped.totalDischargeKg, -3200);
  assert.equal(mapped.singleDischargeKg, -0.1);
  assert.equal(mapped.fermentRunTimeMin, 120);
  assert.equal(mapped.runTimeMin, 15);
  assert.equal(mapped.feedCode, 1);
  assert.equal(mapped.fanCode, 0);
  assert.equal(mapped.signalPct, 85);
  assert.equal(mapped.rawData.CabinTemp, '42.5');
});

test('expands a batch payload and retains timestamp plus device key', () => {
  const items = expandTelemetryPayload({
    timestamp: 1791608608,
    deviceSerialNum: '365701012616B60D',
    devices: [{
      deviceId: 'Mitsubishi_PLC',
      deviceState: 1,
      deviceData: {
        CabinTemp: 30.5,
        HotPlateTemp: 28.4,
        Humidity: 50.25,
        RealTimeWeight: 0,
        OperatingStatus: 0,
        FermentState: 1,
        SingleAddMaterial: 1.2,
        TotalAddMaterial: 18.313,
        SingleDischarge: -0.1,
        TotalDischarge: 0.004,
      },
    }],
  });

  assert.equal(items.length, 1);
  const mapped = mapTelemetryInput(items[0]);
  assert.equal(mapped.deviceKey, 'Mitsubishi_PLC');
  assert.equal(mapped.serial, '365701012616B60D');
  assert.equal(mapped.recordedAt.toISOString(), '2026-10-10T05:03:28.000Z');
  assert.equal(mapped.operatingStatusCode, 0);
  assert.equal(mapped.fermentStateCode, 1);
  assert.equal(mapped.cabinTempC, 30.5);
  assert.equal(mapped.singleDischargeKg, -0.1);
  assert.equal(mapped.rawData.RealTimeWeight, 0);
});

test('rejects an empty device batch', () => {
  assert.throws(() => expandTelemetryPayload({ timestamp: 1, devices: [] }), /no devices/);
  assert.throws(() => expandTelemetryPayload({ devices: null }), /must be an array/);
});

test('parses telemetry timestamps in seconds and milliseconds', () => {
  assert.equal(parseTelemetryTimestamp(1769581200).toISOString(), '2026-01-28T06:20:00.000Z');
  assert.equal(parseTelemetryTimestamp(1769581200000).toISOString(), '2026-01-28T06:20:00.000Z');
  assert.throws(() => parseTelemetryTimestamp('not-a-date'), /valid date/);
});

test('rejects unsupported telemetry sources', () => {
  assert.throws(
    () => mapTelemetryInput({ machineId: 'x', source: 'unknown', data: {} }),
    /source/
  );
});

test('empty vendor synchronization is a no-op without touching the database', async () => {
  assert.deepEqual(await upsertVendorDevices([]), []);
});

test('device data migration contains the required normalized data model', () => {
  const sql = fs.readFileSync(path.join(root, 'db/migrations/004_device_data_model.sql'), 'utf8');
  const alignment = fs.readFileSync(
    path.join(root, 'db/migrations/005_device_data_field_alignment.sql'),
    'utf8'
  );
  const cleanup = fs.readFileSync(
    path.join(root, 'db/migrations/006_remove_mqtt_source.sql'),
    'utf8'
  );
  for (const table of ['vendor_devices', 'machine_telemetry', 'alert_events', 'system_settings']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  for (const column of [
    'vendor_device_id', 'serial_number', 'device_name', 'online_code',
    'cabin_temp_c', 'hot_plate_temp_c', 'humidity_pct', 'real_time_weight_kg',
    'single_added_material_kg', 'total_added_material_kg', 'single_discharge_kg',
    'total_discharge_kg', 'operating_status_code', 'ferment_state_code',
    'device_key', 'feed_code', 'fan_code', 'raw_data'
  ]) {
    assert.match(sql, new RegExp(column));
  }
  assert.match(sql, /REFERENCES machines\(id\) ON DELETE CASCADE/);
  assert.match(sql, /REFERENCES vendor_devices\(vendor_device_id\)/);
  assert.match(alignment, /DROP VIEW IF EXISTS v_machine_latest_telemetry/);
  assert.match(alignment, /ADD COLUMN IF NOT EXISTS device_key TEXT/);
  assert.match(alignment, /ALTER COLUMN ferment_run_time_min TYPE NUMERIC/);
  assert.match(sql, /source\s+TEXT NOT NULL DEFAULT 'api'/);
  assert.doesNotMatch(sql, /source IN \([^)]*mqtt/);
  assert.match(cleanup, /ALTER COLUMN source SET DEFAULT 'api'/);
  assert.match(cleanup, /CHECK \(source IN \('vendor', 'api', 'manual'\)\)/);
});
