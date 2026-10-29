import { query, withTransaction } from '../db.js';
import { ValidationError } from '../lib/errors.js';

const TELEMETRY_SOURCES = new Set(['vendor', 'api', 'manual']);

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tonsToKg(value) {
  const tons = finiteNumber(value);
  return tons === null ? null : tons * 1000;
}

function boundedNumber(value, min, max) {
  const number = finiteNumber(value);
  return number !== null && number >= min && number <= max ? number : null;
}

function integer(value) {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function text(value, max = 500) {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result ? result.slice(0, max) : null;
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function statusText(value) {
  if (value === undefined || value === null || value === '') return null;
  return finiteNumber(value) === null ? text(value, 200) : null;
}

export function parseTelemetryTimestamp(value, fallback = new Date()) {
  if (value === undefined || value === null || value === '') return fallback;
  let date;
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const number = Number(value);
    date = new Date(number < 100000000000 ? number * 1000 : number);
  } else {
    date = new Date(value);
  }
  if (!Number.isFinite(date.getTime())) {
    throw new ValidationError('`timestamp` must be a valid date, Unix seconds or Unix milliseconds');
  }
  return date;
}

export function mapTelemetryInput(input, { receivedAt = new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Telemetry payload must be a JSON object');
  }

  const data = objectOrEmpty(input.data ?? input.deviceData ?? input.telemetry);
  const payload = Object.keys(data).length ? data : input;
  const sourceRaw = text(input.source, 20)?.toLowerCase() || 'api';
  if (!TELEMETRY_SOURCES.has(sourceRaw)) {
    throw new ValidationError('`source` must be one of: vendor, api, manual');
  }

  const recordedAt = parseTelemetryTimestamp(
    firstDefined(input.timestamp, input.recordedAt, input.receivedAt),
    receivedAt
  );
  const receivedDate = parseTelemetryTimestamp(
    firstDefined(input.receivedAt, input.ingestedAt),
    receivedAt
  );
  return {
    machineId: text(input.machineId, 80),
    deviceKey: text(firstDefined(input.deviceKey, input.deviceId), 160),
    vendorDeviceId: text(input.vendorDeviceId, 160),
    serial: text(firstDefined(input.serial, input.deviceSerialNum), 160),
    source: sourceRaw,
    sourceEventId: text(firstDefined(input.sourceEventId, input.messageId, input.eventId), 256),
    recordedAt,
    receivedAt: receivedDate,
    deviceState: integer(firstDefined(input.deviceState, input.deviceStatusCode)),
    cabinTempC: finiteNumber(firstDefined(payload.CabinTemp, payload.cabinTemp, payload.cabin_temp, payload.temperature)),
    hotPlateTempC: finiteNumber(firstDefined(payload.HotPlateTemp, payload.hotPlateTemp, payload.hot_plate_temp)),
    humidityPct: boundedNumber(firstDefined(payload.Humidity, payload.humidity), 0, 100),
    realTimeWeightKg: finiteNumber(firstDefined(payload.RealTimeWeight, payload.realTimeWeight, payload.weight)),
    singleAddedMaterialKg: finiteNumber(firstDefined(payload.SingleAddMaterial, payload.singleAddMaterial)),
    totalAddedMaterialKg: tonsToKg(firstDefined(payload.TotalAddMaterial, payload.totalAddMaterial)),
    singleDischargeKg: finiteNumber(firstDefined(payload.SingleDischarge, payload.singleDischarge)),
    totalDischargeKg: tonsToKg(firstDefined(payload.TotalDischarge, payload.totalDischarge, payload.OtalUnloadingWeight)),
    runTimeMin: finiteNumber(firstDefined(payload.RunTime, payload.runTime)),
    operatingStatusCode: integer(firstDefined(payload.OperatingStatus, payload.operatingStatusCode)),
    operatingStatus: statusText(firstDefined(payload.OperatingStatus, payload.operatingStatus)),
    fermentStateCode: integer(firstDefined(payload.FermentState, payload.fermentStateCode)),
    fermentState: statusText(firstDefined(payload.FermentState, payload.fermentState)),
    fermentRunTimeMin: finiteNumber(firstDefined(payload.FermentRunTime, payload.fermentRunTime)),
    feedCode: integer(firstDefined(payload.Feed, payload.feedCode)),
    dischargeCode: integer(firstDefined(payload.Discharge, payload.dischargeCode)),
    deodorizingCode: integer(firstDefined(payload.Deodorizing, payload.deodorizingCode)),
    shredderCode: integer(firstDefined(payload.Shredder, payload.shredderCode)),
    fanCode: integer(firstDefined(payload.Fan, payload.fanCode)),
    mixingMotorCode: integer(firstDefined(payload.MixingMotor, payload.mixingMotorCode)),
    zipperCode: integer(firstDefined(payload.Zipper, payload.zipperCode)),
    energyKwh: finiteNumber(firstDefined(payload.Energy, payload.energy, payload.energyKwh)),
    solarPowerKw: finiteNumber(firstDefined(payload.SolarPower, payload.solarPower)),
    co2Ppm: finiteNumber(firstDefined(payload.CO2, payload.co2, payload.co2Ppm)),
    no2Ppm: finiteNumber(firstDefined(payload.NO2, payload.no2, payload.no2Ppm)),
    h2sPpm: finiteNumber(firstDefined(payload.H2S, payload.h2s, payload.h2sPpm)),
    signalPct: boundedNumber(firstDefined(payload.Signal, payload.signal, payload.signalPct), -1, 100),
    latitude: boundedNumber(firstDefined(input.latitude, payload.latitude), -90, 90),
    longitude: boundedNumber(firstDefined(input.longitude, payload.longitude), -180, 180),
    rawData: objectOrEmpty(firstDefined(input.rawData, input.raw, data, payload)),
  };
}

/**
 * Accepts either one telemetry record or a batch envelope: 
 * { timestamp, devices: [{ deviceId, deviceState, deviceData }] }.
 */
export function expandTelemetryPayload(input) {
  let envelope = {};
  let items;
  if (Array.isArray(input)) {
    items = input;
  } else if (input && typeof input === 'object' && Object.hasOwn(input, 'devices')) {
    if (!Array.isArray(input.devices)) {
      throw new ValidationError('`devices` must be an array');
    }
    envelope = input;
    items = input.devices;
  } else {
    items = [input];
  }

  if (!items.length) throw new ValidationError('Telemetry payload contains no devices');

  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError('Each telemetry device must be a JSON object');
    }
    return {
      ...item,
      timestamp: firstDefined(item.timestamp, item.recordedAt, envelope.timestamp, envelope.recordedAt),
      receivedAt: firstDefined(item.receivedAt, envelope.receivedAt),
      source: firstDefined(item.source, envelope.source),
      sourceEventId: firstDefined(
        item.sourceEventId,
        item.messageId,
        item.eventId,
        envelope.sourceEventId,
        envelope.messageId,
        envelope.eventId
      ),
      serial: firstDefined(item.serial, item.deviceSerialNum, envelope.serial, envelope.deviceSerialNum),
      vendorDeviceId: firstDefined(item.vendorDeviceId, envelope.vendorDeviceId),
      rawData: firstDefined(item.rawData, item.raw, item.deviceData, item.data, item.telemetry),
    };
  });
}

async function findMachine(client, mapped) {
  if (mapped.machineId) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mapped.machineId);
    if (!uuid) throw new ValidationError('`machineId` must be a UUID');
    return client.query(
      'SELECT id, serial, device_id, vendor_device_id FROM machines WHERE id = $1 AND status <> $2 LIMIT 1',
      [mapped.machineId, 'retired']
    );
  }
  if (mapped.deviceKey) {
    return client.query(
      'SELECT id, serial, device_id, vendor_device_id FROM machines WHERE device_id = $1 AND status <> $2 LIMIT 1',
      [mapped.deviceKey, 'retired']
    );
  }
  if (mapped.vendorDeviceId) {
    return client.query(
      'SELECT id, serial, device_id, vendor_device_id FROM machines WHERE vendor_device_id = $1 AND status <> $2 LIMIT 1',
      [mapped.vendorDeviceId, 'retired']
    );
  }
  return client.query(
    'SELECT id, serial, device_id, vendor_device_id FROM machines WHERE serial = $1 AND status <> $2 LIMIT 1',
    [mapped.serial, 'retired']
  );
}

async function saveMappedTelemetry(client, mapped) {
  if (!mapped.machineId && !mapped.deviceKey && !mapped.vendorDeviceId && !mapped.serial) {
    throw new ValidationError('Supply `machineId`, `deviceId`, `vendorDeviceId` or `serial`');
  }

  const machineResult = await findMachine(client, mapped);
  const machine = machineResult.rows[0];
  if (!machine) {
    throw new ValidationError('No active machine matches the supplied identity. Link the machine explicitly first.');
  }
  const saved = await client.query(
    `INSERT INTO machine_telemetry (
       machine_id, vendor_device_id, source, source_event_id, recorded_at, received_at,
       device_state, device_key, cabin_temp_c, hot_plate_temp_c, humidity_pct,
       real_time_weight_kg, single_added_material_kg, total_added_material_kg,
       single_discharge_kg, total_discharge_kg, run_time_min,
       operating_status_code, operating_status, ferment_state_code, ferment_state,
       ferment_run_time_min, feed_code, discharge_code, deodorizing_code,
       shredder_code, fan_code, mixing_motor_code, zipper_code,
       energy_kwh, solar_power_kw, co2_ppm, no2_ppm, h2s_ppm,
       signal_pct, latitude, longitude, raw_data
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
       $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
     )
     ON CONFLICT (machine_id, source, recorded_at) DO UPDATE SET
       vendor_device_id = EXCLUDED.vendor_device_id,
       source_event_id = COALESCE(EXCLUDED.source_event_id, machine_telemetry.source_event_id),
       received_at = EXCLUDED.received_at,
       device_state = EXCLUDED.device_state,
       device_key = EXCLUDED.device_key,
       cabin_temp_c = EXCLUDED.cabin_temp_c,
       hot_plate_temp_c = EXCLUDED.hot_plate_temp_c,
       humidity_pct = EXCLUDED.humidity_pct,
       real_time_weight_kg = EXCLUDED.real_time_weight_kg,
       single_added_material_kg = EXCLUDED.single_added_material_kg,
       total_added_material_kg = EXCLUDED.total_added_material_kg,
       single_discharge_kg = EXCLUDED.single_discharge_kg,
       total_discharge_kg = EXCLUDED.total_discharge_kg,
       run_time_min = EXCLUDED.run_time_min,
       operating_status_code = EXCLUDED.operating_status_code,
       operating_status = EXCLUDED.operating_status,
       ferment_state_code = EXCLUDED.ferment_state_code,
       ferment_state = EXCLUDED.ferment_state,
       ferment_run_time_min = EXCLUDED.ferment_run_time_min,
       feed_code = EXCLUDED.feed_code,
       discharge_code = EXCLUDED.discharge_code,
       deodorizing_code = EXCLUDED.deodorizing_code,
       shredder_code = EXCLUDED.shredder_code,
       fan_code = EXCLUDED.fan_code,
       mixing_motor_code = EXCLUDED.mixing_motor_code,
       zipper_code = EXCLUDED.zipper_code,
       energy_kwh = EXCLUDED.energy_kwh,
       solar_power_kw = EXCLUDED.solar_power_kw,
       co2_ppm = EXCLUDED.co2_ppm,
       no2_ppm = EXCLUDED.no2_ppm,
       h2s_ppm = EXCLUDED.h2s_ppm,
       signal_pct = EXCLUDED.signal_pct,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       raw_data = EXCLUDED.raw_data
     RETURNING id, machine_id, recorded_at, received_at`,
    [
      machine.id, machine.vendor_device_id,
      mapped.source, mapped.sourceEventId, mapped.recordedAt, mapped.receivedAt,
      mapped.deviceState, mapped.deviceKey ?? machine.device_id,
      mapped.cabinTempC, mapped.hotPlateTempC, mapped.humidityPct,
      mapped.realTimeWeightKg, mapped.singleAddedMaterialKg, mapped.totalAddedMaterialKg,
      mapped.singleDischargeKg, mapped.totalDischargeKg, mapped.runTimeMin,
      mapped.operatingStatusCode, mapped.operatingStatus,
      mapped.fermentStateCode, mapped.fermentState,
      mapped.fermentRunTimeMin, mapped.feedCode, mapped.dischargeCode,
      mapped.deodorizingCode, mapped.shredderCode, mapped.fanCode,
      mapped.mixingMotorCode, mapped.zipperCode,
      mapped.energyKwh, mapped.solarPowerKw, mapped.co2Ppm, mapped.no2Ppm, mapped.h2sPpm,
      mapped.signalPct, mapped.latitude, mapped.longitude, JSON.stringify(mapped.rawData),
    ]
  );

  await client.query(
    `UPDATE machines
        SET last_seen_at = CASE
              WHEN last_seen_at IS NULL OR last_seen_at < $2 THEN $2
              ELSE last_seen_at
            END
      WHERE id = $1`,
    [machine.id, mapped.recordedAt]
  );
  return saved.rows[0];
}

export async function ingestTelemetryPayload(input) {
  const mappedRecords = expandTelemetryPayload(input).map((item) => mapTelemetryInput(item));
  return withTransaction(async (client) => {
    const saved = [];
    for (const mapped of mappedRecords) {
      saved.push(await saveMappedTelemetry(client, mapped));
    }
    return saved;
  });
}

export async function ingestMachineTelemetry(input) {
  const saved = await ingestTelemetryPayload(input);
  return saved[0];
}

/*
 * Kept as a separate export for callers that ingest vendor records. This path
 * mirrors vendor inventory only; it never guesses a machine/client binding.
 */
export async function upsertVendorDevices(records) {
  if (!Array.isArray(records)) throw new ValidationError('Vendor device records must be an array');
  if (!records.length) return [];

  return withTransaction(async (client) => {
    const saved = [];
    for (const record of records) {
      if (!record || typeof record !== 'object' || !record.id) continue;
      const result = await client.query(
        `INSERT INTO vendor_devices (
           vendor_device_id, vendor_user_id, vendor_user_name, serial_number,
           device_name, device_type, template_name, address_code, online_code,
           latitude, longitude, device_power, image_url, vendor_created_at,
           last_synced_at, payload
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),$15
         )
         ON CONFLICT (vendor_device_id) DO UPDATE SET
           vendor_user_id = EXCLUDED.vendor_user_id,
           vendor_user_name = EXCLUDED.vendor_user_name,
           serial_number = EXCLUDED.serial_number,
           device_name = EXCLUDED.device_name,
           device_type = EXCLUDED.device_type,
           template_name = EXCLUDED.template_name,
           address_code = EXCLUDED.address_code,
           online_code = EXCLUDED.online_code,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           device_power = EXCLUDED.device_power,
           image_url = EXCLUDED.image_url,
           vendor_created_at = EXCLUDED.vendor_created_at,
           last_synced_at = now(),
           payload = EXCLUDED.payload
         RETURNING *`,
        [
          text(record.id, 160), text(record.owner?.id, 160), text(record.owner?.userName, 200),
          text(record.serialNumber, 160), text(record.deviceName, 300), integer(record.deviceType),
          text(record.templateName, 200), text(record.addressCode, 20), integer(record.onlineCode),
          boundedNumber(record.latitude, -90, 90), boundedNumber(record.longitude, -180, 180),
          finiteNumber(record.power), text(record.imageUrl, 2000),
          record.createdAt ? parseTelemetryTimestamp(record.createdAt) : null, JSON.stringify(record),
        ]
      );
      saved.push(result.rows[0]);
    }
    return saved;
  });
}

export async function listStoredTelemetry(filters) {
  const params = [];
  const clauses = [];
  if (filters.machineId) {
    params.push(filters.machineId);
    clauses.push(`t.machine_id = $${params.length}`);
  }
  if (filters.clientId) {
    params.push(filters.clientId);
    clauses.push(`m.client_id = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    clauses.push(`t.recorded_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    clauses.push(`t.recorded_at <= $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT t.*, m.serial AS machine_serial, m.name AS machine_name
       FROM machine_telemetry t
       JOIN machines m ON m.id = t.machine_id
       ${where}
      ORDER BY t.recorded_at DESC, t.id DESC
      LIMIT ${filters.limit}`,
    params
  );
  return rows;
}
