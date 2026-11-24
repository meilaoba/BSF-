import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { fetchAllVendorDailyStats } from '../providers/vendor-daily-stats.js';
import { defaultGhgSettingsForDevice } from '../shared/ghg-defaults.js';
import { hongKongDateKey } from '../shared/metrics.js';

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, max = 300) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function todayText(now) {
  return hongKongDateKey(now instanceof Date ? now : new Date(now));
}

function withinRange(dateKey, start, end, today) {
  return dateKey >= start && dateKey <= end && dateKey <= today;
}

function effectiveReportSettings(settings = {}, device = {}) {
  const defaults = defaultGhgSettingsForDevice(device) || {};
  return {
    clientRegion: settings.clientRegion || defaults.region || null,
    ghgFormula: {
      ...(defaults.ghgFormula || {}),
      ...(settings.ghgFormula || {}),
    },
  };
}

export function dailyStatSnapshot(record, deviceId, settings = {}) {
  const kitchenWaste = finiteNumber(record?.kitchenWaste);
  const powerConsume = finiteNumber(record?.powerConsume);
  const runTime = finiteNumber(record?.runTime);
  const wasteKg = kitchenWaste === null
    ? null
    : kitchenWaste * config.auth.vendor.kitchenWasteToKgFactor;
  const energyKwh = powerConsume === null
    ? null
    : powerConsume * config.auth.vendor.powerConsumeToKwhFactor;
  return {
    capturedAt: `${record.statDate}T12:00:00+08:00`,
    statDate: record.statDate,
    deviceId: String(deviceId),
    wasteKg,
    // Vendor powerConsume is retained for audit only. Graphs and Reports use
    // the canonical operating-status energy resolver so both surfaces agree.
    energyKwh: null,
    vendorPowerConsumeKwh: energyKwh,
    runTimeHours: runTime,
    dailyAggregate: true,
    clientRegion: settings.clientRegion ?? null,
    ghgFormula: settings.ghgFormula ?? null,
  };
}

export function dailyStatStorageRow(record, device) {
  const kitchenWasteRaw = finiteNumber(record?.kitchenWaste);
  const powerConsumeRaw = finiteNumber(record?.powerConsume);
  return {
    statDate: record.statDate,
    deviceName: cleanText(device?.deviceName ?? record?.deviceName),
    runTimeHours: finiteNumber(record?.runTime),
    savedCarbonKg: finiteNumber(record?.saveCarbon),
    kitchenWasteRaw,
    kitchenWasteKg: kitchenWasteRaw === null
      ? null
      : kitchenWasteRaw * config.auth.vendor.kitchenWasteToKgFactor,
    powerConsumeRaw,
    vendorPowerConsumeKwh: powerConsumeRaw === null
      ? null
      : powerConsumeRaw * config.auth.vendor.powerConsumeToKwhFactor,
    deviceLocation: cleanText(record?.deviceLocation),
    unloadingWeightRaw: finiteNumber(record?.unloadingWeight),
    bindingTimeMs: finiteNumber(record?.bindingTime),
    sourcePayload: record,
  };
}

export function storedDailyStatSnapshot(row, settings = {}) {
  const kitchenWasteRaw = finiteNumber(row.kitchen_waste_raw);
  const powerConsumeRaw = finiteNumber(row.power_consume_raw);
  return {
    capturedAt: `${row.stat_date}T12:00:00+08:00`,
    statDate: row.stat_date,
    deviceId: String(row.vendor_device_id),
    wasteKg: kitchenWasteRaw === null
      ? finiteNumber(row.kitchen_waste_kg)
      : kitchenWasteRaw * config.auth.vendor.kitchenWasteToKgFactor,
    energyKwh: null,
    vendorPowerConsumeKwh: powerConsumeRaw === null
      ? finiteNumber(row.vendor_power_consume_kwh)
      : powerConsumeRaw * config.auth.vendor.powerConsumeToKwhFactor,
    runTimeHours: finiteNumber(row.run_time_hours),
    dailyAggregate: true,
    clientRegion: settings.clientRegion ?? null,
    ghgFormula: settings.ghgFormula ?? null,
  };
}

export function mergeDailyStatSnapshots(storedRows, liveRows) {
  const merged = new Map();
  for (const row of [...(storedRows || []), ...(liveRows || [])]) {
    if (!row?.deviceId || !row?.statDate) continue;
    merged.set(`${row.deviceId}|${row.statDate}`, row);
  }
  return Array.from(merged.values())
    .sort((left, right) => (
      left.capturedAt.localeCompare(right.capturedAt)
      || left.deviceId.localeCompare(right.deviceId)
    ));
}

export function vendorDailyStatsRefreshRange(start, end, now = new Date()) {
  if (!start || !end || start > end) return null;
  const today = todayText(now);
  const vendorStart = addDays(today, -59);
  const refreshStart = start > vendorStart ? start : vendorStart;
  const refreshEnd = end < today ? end : today;
  return refreshStart <= refreshEnd ? { start: refreshStart, end: refreshEnd } : null;
}

export function dailyStatsSyncStartDate(
  latestDate,
  today,
  { backfillDays = 60, refreshDays = 3 } = {}
) {
  const backfillStart = addDays(today, -(positiveInteger(backfillDays, 60) - 1));
  const recentStart = addDays(today, -(positiveInteger(refreshDays, 3) - 1));
  return latestDate && latestDate >= recentStart
    ? addDays(latestDate, -2)
    : backfillStart;
}

export async function saveVendorDailyStatRecords({
  vendorAccountId,
  device,
  records,
  fetchedAt = new Date(),
} = {}) {
  const accountId = cleanText(vendorAccountId, 160);
  const vendorDeviceId = cleanText(device?.id, 160);
  if (!accountId || !vendorDeviceId || !Array.isArray(records) || !records.length) return 0;

  return withTransaction(async (client) => {
    let saved = 0;
    for (const record of records) {
      const row = dailyStatStorageRow(record, device);
      await client.query(
        `INSERT INTO vendor_daily_stats (
           vendor_account_id, vendor_device_id, vendor_device_name, stat_date,
           run_time_hours, saved_carbon_kg, kitchen_waste_raw, kitchen_waste_kg,
           power_consume_raw, vendor_power_consume_kwh, device_location,
           unloading_weight_raw, binding_time_ms, source_payload, last_fetched_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
         )
         ON CONFLICT (vendor_account_id, vendor_device_id, stat_date) DO UPDATE SET
           vendor_device_name = COALESCE(EXCLUDED.vendor_device_name, vendor_daily_stats.vendor_device_name),
           run_time_hours = COALESCE(EXCLUDED.run_time_hours, vendor_daily_stats.run_time_hours),
           saved_carbon_kg = COALESCE(EXCLUDED.saved_carbon_kg, vendor_daily_stats.saved_carbon_kg),
           kitchen_waste_raw = COALESCE(EXCLUDED.kitchen_waste_raw, vendor_daily_stats.kitchen_waste_raw),
           kitchen_waste_kg = COALESCE(EXCLUDED.kitchen_waste_kg, vendor_daily_stats.kitchen_waste_kg),
           power_consume_raw = COALESCE(EXCLUDED.power_consume_raw, vendor_daily_stats.power_consume_raw),
           vendor_power_consume_kwh = COALESCE(EXCLUDED.vendor_power_consume_kwh, vendor_daily_stats.vendor_power_consume_kwh),
           device_location = COALESCE(EXCLUDED.device_location, vendor_daily_stats.device_location),
           unloading_weight_raw = COALESCE(EXCLUDED.unloading_weight_raw, vendor_daily_stats.unloading_weight_raw),
           binding_time_ms = COALESCE(EXCLUDED.binding_time_ms, vendor_daily_stats.binding_time_ms),
           source_payload = EXCLUDED.source_payload,
           last_fetched_at = EXCLUDED.last_fetched_at,
           updated_at = now()`,
        [
          accountId,
          vendorDeviceId,
          row.deviceName,
          row.statDate,
          row.runTimeHours,
          row.savedCarbonKg,
          row.kitchenWasteRaw,
          row.kitchenWasteKg,
          row.powerConsumeRaw,
          row.vendorPowerConsumeKwh,
          row.deviceLocation,
          row.unloadingWeightRaw,
          row.bindingTimeMs,
          JSON.stringify(row.sourcePayload),
          fetchedAt,
        ]
      );
      saved += 1;
    }
    return saved;
  });
}

export async function loadStoredVendorDailyStats({
  vendorAccountId,
  includeAllAccounts = false,
  deviceIds = null,
  start,
  end,
  settingsByDevice = new Map(),
} = {}) {
  if (Array.isArray(deviceIds) && !deviceIds.length) return [];
  if (!start || !end) throw new Error('daily stats start and end dates are required');

  const params = [start, end];
  const where = ['stat_date >= $1::date', 'stat_date <= $2::date'];
  if (!includeAllAccounts && !Array.isArray(deviceIds)) {
    if (!vendorAccountId) return [];
    params.push(String(vendorAccountId));
    where.push(`vendor_account_id = $${params.length}`);
  }
  if (Array.isArray(deviceIds)) {
    params.push(deviceIds.map(String));
    where.push(`vendor_device_id = ANY($${params.length}::text[])`);
  }

  const { rows } = await query(
    `WITH deduped AS (
       SELECT DISTINCT ON (vendor_device_id, stat_date) *
         FROM vendor_daily_stats
        WHERE ${where.join(' AND ')}
        ORDER BY vendor_device_id ASC, stat_date ASC, last_fetched_at DESC, id DESC
     )
     SELECT vendor_device_id,
            vendor_device_name,
            to_char(stat_date, 'YYYY-MM-DD') AS stat_date,
            kitchen_waste_raw,
            kitchen_waste_kg,
            power_consume_raw,
            vendor_power_consume_kwh,
            run_time_hours
       FROM deduped
      ORDER BY stat_date ASC, vendor_device_id ASC`,
    params
  );

  return rows.map((row) => {
    const settings = effectiveReportSettings(
      settingsByDevice.get(String(row.vendor_device_id)) || {},
      { deviceName: row.vendor_device_name }
    );
    return storedDailyStatSnapshot(row, settings);
  });
}

export async function claimVendorDailyStatsSync(
  vendorAccountId,
  { now = new Date(), intervalSeconds = config.telemetryCollector.dailyStatsSyncIntervalSeconds } = {}
) {
  const accountId = cleanText(vendorAccountId, 160);
  const interval = positiveInteger(intervalSeconds, 1800);
  if (!accountId) return false;
  const attemptedAt = now instanceof Date ? now : new Date(now);
  const cutoff = new Date(attemptedAt.getTime() - interval * 1000);
  const { rows } = await query(
    `INSERT INTO vendor_daily_stats_sync_state
       (vendor_account_id, last_attempt_at, updated_at)
     VALUES ($1,$2,$2)
     ON CONFLICT (vendor_account_id) DO UPDATE SET
       last_attempt_at = EXCLUDED.last_attempt_at,
       updated_at = EXCLUDED.updated_at
     WHERE vendor_daily_stats_sync_state.last_attempt_at IS NULL
        OR vendor_daily_stats_sync_state.last_attempt_at <= $3
     RETURNING vendor_account_id`,
    [accountId, attemptedAt, cutoff]
  );
  return rows.length > 0;
}

export async function finishVendorDailyStatsSync({
  vendorAccountId,
  success,
  errorCode = null,
  now = new Date(),
} = {}) {
  const accountId = cleanText(vendorAccountId, 160);
  if (!accountId) return;
  const completedAt = now instanceof Date ? now : new Date(now);
  await query(
    `UPDATE vendor_daily_stats_sync_state
        SET last_success_at = CASE WHEN $2 THEN $3 ELSE last_success_at END,
            last_error_code = CASE WHEN $2 THEN NULL ELSE $4 END,
            updated_at = $3
      WHERE vendor_account_id = $1`,
    [accountId, success === true, completedAt, cleanText(errorCode, 120)]
  );
}

async function latestDailyStatDates(vendorAccountId, deviceIds) {
  if (!Array.isArray(deviceIds) || !deviceIds.length) return new Map();
  const { rows } = await query(
    `SELECT vendor_device_id, to_char(max(stat_date), 'YYYY-MM-DD') AS last_stat_date
       FROM vendor_daily_stats
      WHERE vendor_account_id = $1
        AND vendor_device_id = ANY($2::text[])
      GROUP BY vendor_device_id`,
    [vendorAccountId, deviceIds.map(String)]
  );
  return new Map(rows.map((row) => [String(row.vendor_device_id), row.last_stat_date]));
}

export async function syncVendorDailyStatsForDevices({
  token,
  vendorAccountId,
  devices,
  now = new Date(),
  skipDeviceIds = null,
} = {}) {
  const accountId = cleanText(vendorAccountId, 160);
  const vendorDevices = Array.isArray(devices) ? devices : [];
  if (!accountId || !vendorDevices.length) {
    return { attempted: 0, saved: 0, failed: 0, successfulDeviceIds: [] };
  }

  const today = todayText(now);
  const latestByDevice = await latestDailyStatDates(
    accountId,
    vendorDevices.map((device) => String(device.id))
  );
  const summary = { attempted: 0, saved: 0, failed: 0, successfulDeviceIds: [] };

  for (const device of vendorDevices) {
    const deviceId = cleanText(device?.id, 160);
    if (!deviceId || !device.deviceName || skipDeviceIds?.has(deviceId)) continue;
    const latestDate = latestByDevice.get(deviceId);
    const start = dailyStatsSyncStartDate(latestDate, today, {
      backfillDays: config.telemetryCollector.dailyStatsBackfillDays,
      refreshDays: config.telemetryCollector.dailyStatsRefreshDays,
    });
    summary.attempted += 1;
    try {
      const records = await fetchAllVendorDailyStats({
        token,
        deviceName: device.deviceName,
        startTime: start,
        endTime: today,
      });
      summary.saved += await saveVendorDailyStatRecords({
        vendorAccountId: accountId,
        device,
        records,
        fetchedAt: now,
      });
      summary.successfulDeviceIds.push(deviceId);
    } catch (error) {
      summary.failed += 1;
      console.warn(
        `[vendor-daily-stats] device ${deviceId} sync failed:`,
        error.code || error.message
      );
    }
  }
  return summary;
}

export async function loadVendorDailyStatSnapshots({
  token,
  vendorAccountId = null,
  persist = false,
  devices,
  start,
  end,
  settingsByDevice = new Map(),
} = {}) {
  if (!Array.isArray(devices) || !devices.length) {
    return {
      snapshots: [],
      unavailableDeviceCount: 0,
      persistedDeviceCount: 0,
      persistFailureCount: 0,
    };
  }
  const today = todayText(new Date());
  const snapshots = [];
  let unavailableDeviceCount = 0;
  let persistedDeviceCount = 0;
  let persistFailureCount = 0;
  for (const device of devices) {
    if (!device?.deviceName) continue;
    let records;
    try {
      records = await fetchAllVendorDailyStats({
        token,
        deviceName: device.deviceName,
        startTime: start,
        endTime: end,
      });
    } catch (error) {
      unavailableDeviceCount += 1;
      console.warn(
        `[vendor-daily-stats] device ${device.id || 'unknown'} unavailable:`,
        error.code || error.message
      );
      continue;
    }
    if (persist && vendorAccountId && records.length) {
      try {
        await saveVendorDailyStatRecords({
          vendorAccountId,
          device,
          records,
        });
        persistedDeviceCount += 1;
      } catch (error) {
        persistFailureCount += 1;
        console.warn(
          `[vendor-daily-stats] device ${device.id || 'unknown'} persistence failed:`,
          error.code || error.message
        );
      }
    }
    const settings = effectiveReportSettings(
      settingsByDevice.get(String(device.id)) || {},
      device
    );
    for (const record of records) {
      if (!withinRange(record.statDate, start, end, today)) continue;
      snapshots.push(dailyStatSnapshot(record, device.id, settings));
    }
  }
  return {
    snapshots,
    unavailableDeviceCount,
    persistedDeviceCount,
    persistFailureCount,
  };
}
