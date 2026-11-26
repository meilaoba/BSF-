import { AppError, ValidationError } from '../lib/errors.js';
import { query } from '../db.js';
import { sendOk } from '../lib/http.js';
import { optionalInt, optionalString } from '../lib/validate.js';
import { config } from '../config.js';
import {
  aggregateTelemetrySnapshots,
  bucketKeys,
  fertilizerKg,
  hongKongDateKey,
  hongKongHourKey,
  hongKongMonthKey,
  machineCarbonKg,
  mergeFormulaConfig,
  periodRange,
  resolveDailyEnergyKwh,
} from '../shared/metrics.js';
import {
  loadVendorTelemetrySamples,
  loadVendorTelemetrySummaries,
  loadVendorDeviceReportSettings,
  resolveReportRegion,
  resolveVendorDeviceIds,
  vendorAccountIdForSession,
} from '../services/vendor-analytics.js';
import { getEnvironmentTemperature } from '../services/environment-temperature.js';
import { getVendorAccessToken } from '../middleware/session.js';
import { listAllVendorDevicesCached } from '../providers/vendor-devices.js';
import {
  loadStoredVendorDailyStats,
  loadVendorDailyStatSnapshots,
  mergeDailyStatSnapshots,
  vendorDailyStatsRefreshRange,
} from '../services/vendor-daily-stats-analytics.js';
import {
  loadCollectorCredentials,
  refreshCollectorCredentials,
} from '../services/vendor-collector.js';

const PERIODS = new Set(['daily', 'monthly', 'yearly']);
const GROUPS = new Set(['hour', 'day', 'month']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ANALYTICS_CACHE_HEADERS = Object.freeze({
  'Cache-Control': 'private, max-age=60, must-revalidate',
  Vary: 'Cookie, Origin',
});

function validDateKey(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateRangeForRequest(url, period, now) {
  const requestedStart = optionalString(url.searchParams.get('start'), 'start', { max: 10 });
  const requestedEnd = optionalString(url.searchParams.get('end'), 'end', { max: 10 });
  const requestedDate = optionalString(url.searchParams.get('date'), 'date', { max: 10 });
  const year = optionalInt(url.searchParams.get('year'), 'year', { min: 2000, max: 2100 });
  const month = optionalInt(url.searchParams.get('month'), 'month', { min: 1, max: 12 });
  if (requestedStart && !validDateKey(requestedStart)) throw new ValidationError('`start` must be a valid YYYY-MM-DD date');
  if (requestedEnd && !validDateKey(requestedEnd)) throw new ValidationError('`end` must be a valid YYYY-MM-DD date');
  if (requestedDate && !validDateKey(requestedDate)) throw new ValidationError('`date` must be a valid YYYY-MM-DD date');

  if (requestedStart || requestedEnd) {
    const rangeStart = requestedStart || requestedEnd;
    const rangeEnd = requestedEnd || requestedStart;
    if (!rangeStart || !rangeEnd) throw new ValidationError('Both `start` and `end` are required');
    if (rangeStart > rangeEnd) throw new ValidationError('`start` cannot be after `end`');
    if (period === 'daily' && rangeStart !== rangeEnd) {
      throw new ValidationError('Daily analytics must cover exactly one date');
    }
    const spanDays = (Date.parse(`${rangeEnd}T00:00:00Z`) - Date.parse(`${rangeStart}T00:00:00Z`)) / 86400000;
    if (spanDays > 366) throw new ValidationError('Analytics range cannot exceed 366 days');
    return { start: rangeStart, end: rangeEnd };
  }

  if (period === 'daily') {
    if (requestedStart && requestedEnd && requestedStart !== requestedEnd) {
      throw new ValidationError('Daily analytics must cover exactly one date');
    }
    const selectedDate = requestedDate || requestedStart || requestedEnd;
    const range = periodRange({ period, date: selectedDate, now });
    return { start: range.start, end: range.end };
  }
  return periodRange({ period, year, month, date: requestedDate || requestedStart, now });
}

function defaultGroupBy(period) {
  if (period === 'daily') return 'hour';
  if (period === 'yearly') return 'month';
  return 'day';
}

export function analyticsDeviceLookup(scope) {
  if (!scope) return null;
  if (scope.role === 'master_admin') {
    return scope.clientId || scope.machineIds?.length || scope.machineId
      ? {
        clientId: scope.clientId || null,
        machineIds: scope.machineIds || (scope.machineId ? [scope.machineId] : []),
      }
      : null;
  }
  if (scope.role === 'user') {
    const machineIds = scope.machineIds?.length
      ? scope.machineIds
      : (scope.machineId ? [scope.machineId] : []);
    return machineIds.length ? { machineIds } : null;
  }
  if (scope.role === 'client_admin') {
    return {
      clientId: scope.clientId || null,
      machineId: scope.machineId || null,
      vendorAccountId: scope.vendorAccountId || null,
    };
  }
  return null;
}

export function analyticsScopeForUser(user, requested = {}) {
  const role = user?.role;
  if (role === 'client_admin') {
    return {
      role,
      clientId: requested.clientId || null,
      machineId: requested.machineId || null,
    };
  }
  if (role === 'user') {
    const machineIds = [...new Set([
      ...(Array.isArray(user.machineIds) ? user.machineIds : []),
      ...(user.machineId ? [user.machineId] : []),
    ].map(String).filter(Boolean))];
    if (!machineIds.length) throw forbiddenAccount();
    if (requested.machineId && !machineIds.includes(String(requested.machineId))) {
      throw forbiddenAccount('Machine is not assigned to this account');
    }
    return {
      role,
      clientId: user.clientId || null,
      machineId: requested.machineId || (machineIds.length === 1 ? machineIds[0] : null),
      machineIds: requested.machineId ? [requested.machineId] : machineIds,
    };
  }
  if (role !== 'master_admin') throw forbiddenAccount();
  return {
    role,
    clientId: requested.clientId || null,
    machineId: requested.machineId || null,
  };
}

export function matchVendorDeviceId(records, selector) {
  const value = String(selector || '');
  if (!value) return null;
  const record = (Array.isArray(records) ? records : []).find((device) => (
    String(device.id) === value || String(device.serialNumber || '') === value
  ));
  return record ? String(record.id) : null;
}

async function resolveClientAdminDeviceScope(req, vendorAccountId, { clientRef, machineId }) {
  let clientId = null;
  if (clientRef) {
    const ownedClient = await query(
      `SELECT id
         FROM clients
        WHERE vendor_account_id = $1
          AND (id::text = $2 OR lower(name) = lower($2))
        LIMIT 1`,
      [vendorAccountId, clientRef]
    );
    if (!ownedClient.rows[0]) throw forbiddenAccount();
    clientId = ownedClient.rows[0].id;
  }

  if (clientId) {
    return {
      clientId,
      deviceIds: await resolveVendorDeviceIds({ clientId, machineId, vendorAccountId }),
    };
  }

  const localDeviceIds = await resolveVendorDeviceIds({ machineId, vendorAccountId });
  if (machineId && Array.isArray(localDeviceIds) && localDeviceIds.length) {
    return { clientId: null, deviceIds: localDeviceIds };
  }

  const token = await getVendorAccessToken(req.auth);
  const pool = await listAllVendorDevicesCached({ token, pageNum: 1, pageSize: 100 });
  if (machineId) {
    const matched = matchVendorDeviceId(pool.records, machineId);
    return { clientId: null, deviceIds: matched ? [matched] : [] };
  }
  return {
    clientId: null,
    deviceIds: pool.records.map((device) => String(device.id)),
  };
}

async function analyticsContext(req, url) {
  if (!req.auth) throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
  const vendorAccountId = vendorAccountIdForSession(req.auth);
  if (!vendorAccountId) throw forbiddenAccount();

  const requestedClient = optionalString(url.searchParams.get('clientId') ?? url.searchParams.get('client'), 'clientId', { max: 160 });
  const requestedMachine = optionalString(url.searchParams.get('machineId') ?? url.searchParams.get('machine'), 'machineId', { max: 160 });
  const scope = analyticsScopeForUser(req.auth.user, { clientId: requestedClient, machineId: requestedMachine });
  const role = scope.role;
  if (role === 'client_admin') scope.vendorAccountId = vendorAccountId;

  const lookup = analyticsDeviceLookup(scope);
  let deviceIds = lookup ? await resolveVendorDeviceIds(lookup) : null;
  if (role === 'client_admin') {
    const resolved = await resolveClientAdminDeviceScope(req, vendorAccountId, {
      clientRef: scope.clientId,
      machineId: scope.machineId,
    });
    scope.clientId = resolved.clientId;
    deviceIds = resolved.deviceIds;
  } else if (role === 'master_admin' && scope.machineId && Array.isArray(deviceIds) && !deviceIds.length) {
    const token = await getVendorAccessToken(req.auth);
    const pool = await listAllVendorDevicesCached({ token, pageNum: 1, pageSize: 100 });
    const matched = matchVendorDeviceId(pool.records, scope.machineId);
    deviceIds = matched ? [matched] : [];
  }

  return {
    role,
    vendorAccountId,
    includeAllAccounts: role === 'master_admin',
    deviceIds,
    clientId: scope.clientId,
    machineId: scope.machineId,
  };
}

async function loadGraphAnalytics(context, range, sampleGroupBy = 'day') {
  const rows = await loadVendorTelemetrySummaries({
    vendorAccountId: context.vendorAccountId,
    includeAllAccounts: context.includeAllAccounts,
    deviceIds: context.deviceIds,
    start: range.start,
    end: range.end,
    groupBy: sampleGroupBy,
  });

  return {
    rows,
    dataSources: {
      telemetry: { status: 'samples' },
    },
  };
}

export function reportTelemetrySupplementRows(sampleRows) {
  return (Array.isArray(sampleRows) ? sampleRows : [])
    .filter((row) => {
      const hasTemperature = row.cabinTempC !== null && row.cabinTempC !== undefined && row.cabinTempC !== '';
      const hasHumidity = row.humidityPct !== null && row.humidityPct !== undefined && row.humidityPct !== '';
      const hasOperatingStatus = row.operatingStatusCode !== null
        && row.operatingStatusCode !== undefined
        && row.operatingStatusCode !== '';
      return hasTemperature || hasHumidity || hasOperatingStatus;
    })
    .map((row) => ({
      capturedAt: row.capturedAt,
      deviceId: row.deviceId,
      cabinTempC: row.cabinTempC,
      humidityPct: row.humidityPct,
      ...(row.operatingStatusCode === null
        || row.operatingStatusCode === undefined
        || row.operatingStatusCode === ''
        ? {}
        : { operatingStatusCode: row.operatingStatusCode }),
    }));
}

const REPORT_MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function reportDateKeys(period, start, end) {
  if (period === 'yearly') {
    return REPORT_MONTH_LABELS.map((label, index) => ({
      key: `${String(start).slice(0, 4)}-${String(index + 1).padStart(2, '0')}`,
      label,
      date: `${String(start).slice(0, 4)}-${String(index + 1).padStart(2, '0')}`,
    }));
  }
  const keys = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (Number.isFinite(cursor.getTime()) && cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    keys.push({ key, label:String(cursor.getUTCDate()), date:key });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

/**
 * Daily report chart values. Each device-day contributes one arithmetic mean;
 * the visible daily value is their sum across devices.
 */
export function aggregateReportWeightItems(rows, { period, start, end, now = new Date() } = {}) {
  const categories = reportDateKeys(period, start, end);
  const byKey = new Map(categories.map((item) => [item.key, item]));
  const buckets = new Map();
  let totalWeightKg = 0;
  let totalSamples = 0;
  const onlineDayKeys = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const status = Number(row?.deviceStatusCode);
    const online = status === 1 || status === 2;
    const average = Math.abs(Number(row?.weightAverageKg));
    if (!online || !Number.isFinite(average)) continue;
    const weightSum = Math.abs(Number(row?.weightSumKg));
    const sampleCount = Number(row?.weightSampleCount);
    const effectiveSum = Number.isFinite(weightSum) ? weightSum : average;
    const effectiveCount = Number.isFinite(sampleCount) && sampleCount > 0 ? sampleCount : 1;
    const capturedAt = String(row?.capturedAt || '');
    const dailyKey = capturedAt.slice(0, 10);
    const key = period === 'yearly' ? dailyKey.slice(0, 7) : dailyKey;
    if (!byKey.has(key)) continue;
    const bucket = buckets.get(key) || { weightSum:0, sampleCount:0 };
    bucket.weightSum += effectiveSum;
    bucket.sampleCount += effectiveCount;
    buckets.set(key, bucket);
    totalWeightKg += effectiveSum;
    totalSamples += effectiveCount;
    onlineDayKeys.add(dailyKey);
  }

  const todayKey = hongKongDateKey(now);
  const items = categories.map((item) => {
    const bucket = buckets.get(item.key);
    const average = bucket && bucket.sampleCount
      ? bucket.weightSum / bucket.sampleCount
      : null;
    const available = period === 'yearly'
      ? item.key <= todayKey.slice(0, 7)
      : item.date <= todayKey;
    return {
      date:item.date,
      label:item.label,
      value:available ? average : null,
      averageKg:available ? average : null,
    };
  });
  const calendarDays = period === 'yearly'
    ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
    : categories.length;
  const activeDays = onlineDayKeys.size;
  const averageKg = totalSamples ? totalWeightKg / totalSamples : null;
  return {
    items,
    summary: {
      averageKg,
      totalKg:averageKg === null ? null : averageKg * activeDays,
      sampleCount:totalSamples,
      calendarDays,
      activeDays,
    },
  };
}

export function reportGhgFromWeight(wasteTotalKg, fixedCarbonKg, wasteReductionFactor = 1.5) {
  if (wasteTotalKg === null || wasteTotalKg === undefined || fixedCarbonKg === null || fixedCarbonKg === undefined) {
    return null;
  }
  const waste = Number(wasteTotalKg);
  const fixedCarbon = Number(fixedCarbonKg);
  const factor = Number(wasteReductionFactor);
  if (!Number.isFinite(waste) || !Number.isFinite(fixedCarbon) || !Number.isFinite(factor)) {
    return null;
  }
  return waste * factor - fixedCarbon;
}

export function aggregateWeightGraph(rows, {
  period,
  start,
  end,
  now = new Date(),
  formula = {},
} = {}) {
  const onlineRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => (
      row
      && (Number(row.deviceStatusCode) === 1 || Number(row.deviceStatusCode) === 2)
      && Number.isFinite(Number(row.weightAverageKg))
    ))
    .map((row) => ({
      ...row,
      weightAverageKg: Math.abs(Number(row.weightAverageKg)),
      weightSumKg: Number.isFinite(Number(row.weightSumKg))
        ? Math.abs(Number(row.weightSumKg))
        : undefined,
    }));
  const reportWeight = aggregateReportWeightItems(onlineRows, { period, start, end, now });

  let weightItems = reportWeight.items;
  if (period === 'daily') {
    const keys = bucketKeys('hour', start, end);
    const buckets = new Map();
    for (const row of onlineRows) {
      const key = hongKongHourKey(row.capturedAt);
      if (!keys.includes(key)) continue;
      const sum = Number(row.weightSumKg);
      const count = Number(row.weightSampleCount);
      const bucket = buckets.get(key) || { sum:0, count:0 };
      bucket.sum += Number.isFinite(sum) ? sum : Number(row.weightAverageKg);
      bucket.count += Number.isFinite(count) && count > 0 ? count : 1;
      buckets.set(key, bucket);
    }
    weightItems = keys.map((key) => {
      const bucket = buckets.get(key);
      return {
        date:key,
        label:key.slice(11, 16),
        value:bucket && bucket.count ? bucket.sum / bucket.count : null,
      };
    });
  }

  const deviceDays = new Map();
  for (const row of onlineRows) {
    const dateKey = hongKongDateKey(row.capturedAt);
    const key = `${row.deviceId}|${dateKey}`;
    const day = deviceDays.get(key) || {
      dateKey,
      statusCode:null,
      weightSumKg:0,
      weightSamples:0,
      region:row.clientRegion || 'non-hk',
      formula:mergeFormulaConfig(formula, row.ghgFormula),
    };
    const statusCode = Number(row.deviceStatusCode);
    if (statusCode === 2 || (statusCode === 1 && day.statusCode !== 2)) day.statusCode = statusCode;
    const weight = Number(row.weightAverageKg);
    if (Number.isFinite(weight)) {
      const sum = Number(row.weightSumKg);
      const count = Number(row.weightSampleCount);
      day.weightSumKg += Number.isFinite(sum) ? sum : weight;
      day.weightSamples += Number.isFinite(count) && count > 0 ? count : 1;
    }
    deviceDays.set(key, day);
  }

  const dayGhg = new Map();
  for (const day of deviceDays.values()) {
    if (!day.weightSamples) continue;
    const weightKg = day.weightSumKg / day.weightSamples;
    const energyKwh = resolveDailyEnergyKwh(day.statusCode, day.formula);
    const fixedCarbonKg = energyKwh === null
      ? null
      : machineCarbonKg(energyKwh, day.region, 1, day.formula);
    const wasteFactor = Number(day.formula && day.formula.wasteReductionFactor);
    const ghgKg = fixedCarbonKg === null || !Number.isFinite(wasteFactor)
      ? null
      : weightKg * wasteFactor - fixedCarbonKg;
    const current = dayGhg.get(day.dateKey) || { ghgKg:0, valid:true };
    if (ghgKg === null) current.valid = false;
    else current.ghgKg += ghgKg;
    dayGhg.set(day.dateKey, current);
  }

  const graphGroupBy = period === 'daily' ? 'hour' : period === 'yearly' ? 'month' : 'day';
  const ghgKeys = bucketKeys(graphGroupBy, start, end);
  const monthGhg = new Map();
  const ghgByKey = new Map();
  for (const [dateKey, value] of dayGhg.entries()) {
    if (!value.valid) continue;
    const ghgKg = value.ghgKg;
    if (period === 'yearly') {
      const monthKey = dateKey.slice(0, 7);
      monthGhg.set(monthKey, (monthGhg.get(monthKey) || 0) + ghgKg);
    } else if (period === 'daily') {
      ghgByKey.set(`${dateKey} 12:00`, ghgKg);
    } else {
      ghgByKey.set(dateKey, ghgKg);
    }
  }
  const ghgItems = ghgKeys.map((key) => ({
    date:key,
    label:key,
    value:period === 'yearly'
      ? (monthGhg.has(key) ? monthGhg.get(key) : null)
      : (ghgByKey.has(key) ? ghgByKey.get(key) : null),
  }));
  return {
    items:weightItems,
    ghgItems,
    summary:reportWeight.summary,
  };
}

async function loadReportAnalytics(req, context, range) {
  const settingsByDevice = await loadVendorDeviceReportSettings({
    deviceIds: context.deviceIds,
  });
  const storedDailyRows = await loadStoredVendorDailyStats({
    vendorAccountId: context.vendorAccountId,
    includeAllAccounts: context.includeAllAccounts,
    deviceIds: context.deviceIds,
    start: range.start,
    end: range.end,
    settingsByDevice,
  });
  const telemetryRows = await loadVendorTelemetrySummaries({
    vendorAccountId: context.vendorAccountId,
    includeAllAccounts: context.includeAllAccounts,
    deviceIds: context.deviceIds,
    start: range.start,
    end: range.end,
    groupBy: 'day',
  });
  const supplementalRows = reportTelemetrySupplementRows(telemetryRows);
  const refreshRange = vendorDailyStatsRefreshRange(range.start, range.end, new Date());
  let collector = null;
  let unavailableDeviceCount = 0;
  let liveDailyRows = [];
  let persistedDeviceCount = 0;
  let persistFailureCount = 0;

  if (!refreshRange) {
    return {
      rows: [...storedDailyRows, ...supplementalRows],
      telemetryRows,
      dataSources: {
        dailyStats: {
          status: storedDailyRows.length ? 'local' : 'empty',
          storedCount: storedDailyRows.length,
          liveCount: 0,
          persistedDeviceCount: 0,
          persistFailureCount: 0,
        },
        telemetry: { status: telemetryRows.length ? 'samples' : 'unavailable' },
        reportCredential: { status: 'not-needed' },
      },
    };
  }

  try {
    collector = await loadCollectorCredentials();
    let token = collector?.accessToken || await getVendorAccessToken(req.auth);
    let vendorDevices;
    try {
      vendorDevices = await listAllVendorDevicesCached({ token, pageNum: 1, pageSize: 100 });
    } catch (error) {
      if (error?.code !== 'VENDOR_SESSION_EXPIRED' || !collector?.refreshToken) throw error;
      token = await refreshCollectorCredentials(collector, token);
      vendorDevices = await listAllVendorDevicesCached({ token, pageNum: 1, pageSize: 100 });
    }
    const allowedIds = Array.isArray(context.deviceIds)
      ? new Set(context.deviceIds.map(String))
      : null;
    const devices = vendorDevices.records.filter((device) => (
      !allowedIds || allowedIds.has(String(device.id))
    ));
    const liveResult = await loadVendorDailyStatSnapshots({
      token,
      vendorAccountId: context.vendorAccountId,
      persist: true,
      devices,
      start: refreshRange.start,
      end: refreshRange.end,
      settingsByDevice,
    });
    liveDailyRows = liveResult.snapshots;
    unavailableDeviceCount = liveResult.unavailableDeviceCount;
    persistedDeviceCount = liveResult.persistedDeviceCount;
    persistFailureCount = liveResult.persistFailureCount;
  } catch (error) {
    if (!storedDailyRows.length) throw error;
    unavailableDeviceCount = Array.isArray(context.deviceIds) && context.deviceIds.length
      ? context.deviceIds.length
      : 1;
    console.warn(
      '[vendor-daily-stats] live refresh unavailable, using stored reports:',
      error.code || error.message
    );
  }

  const dailyRows = mergeDailyStatSnapshots(storedDailyRows, liveDailyRows);
  let status;
  if (unavailableDeviceCount > 0 || persistFailureCount > 0) {
    status = dailyRows.length ? 'partial' : 'unavailable';
  } else if (liveDailyRows.length || persistedDeviceCount > 0) {
    status = 'vendor';
  } else if (storedDailyRows.length) {
    status = 'local';
  } else {
    status = 'empty';
  }

  return {
    rows: [...dailyRows, ...supplementalRows],
    telemetryRows,
    dataSources: {
      dailyStats: {
        status,
        storedCount: storedDailyRows.length,
        liveCount: liveDailyRows.length,
        persistedDeviceCount,
        persistFailureCount,
      },
      telemetry: { status: telemetryRows.length ? 'samples' : 'unavailable' },
      reportCredential: { status: collector ? 'collector' : 'session' },
    },
  };
}

function forbiddenAccount() {
  return new AppError('VENDOR_ACCOUNT_SCOPE_REQUIRED', 'The signed-in account has no vendor telemetry scope', {
    status: 403,
  });
}

function rawRangeValue(value, field) {
  const text = optionalString(value, field, { max: 19 });
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    throw new ValidationError(`\`${field}\` must be YYYY-MM-DD or YYYY-MM-DDTHH:mm`);
  }
  const dateText = match[1];
  const date = new Date(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
    throw new ValidationError(`\`${field}\` contains an invalid date`);
  }
  const hasTime = match[2] !== undefined;
  return {
    date: dateText,
    time: hasTime ? `${match[2]}:${match[3]}:${match[4] || '00'}` : null,
    hasTime,
  };
}

function addDateDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function rawSampleRange(url) {
  const startInput = rawRangeValue(url.searchParams.get('start'), 'start');
  const endInput = rawRangeValue(url.searchParams.get('end'), 'end');
  const fallbackDate = periodRange({ period: 'daily', now: new Date() }).start;
  const startDate = startInput?.date || endInput?.date || fallbackDate;
  const resolvedStart = `${startDate}T${startInput?.time || '00:00:00'}`;
  const resolvedEnd = endInput
    ? (endInput.hasTime
      ? `${endInput.date}T${endInput.time}`
      : `${addDateDays(endInput.date, 1)}T00:00:00`)
    : `${addDateDays(startDate, 1)}T00:00:00`;
  if (resolvedStart >= resolvedEnd) throw new ValidationError('`start` must be earlier than `end`');
  const spanDays = (
    Date.parse(`${resolvedEnd}+08:00`) - Date.parse(`${resolvedStart}+08:00`)
  ) / 86400000;
  if (spanDays > 60) throw new ValidationError('Raw sample range cannot exceed 60 days');
  return { start: resolvedStart, end: resolvedEnd };
}
export function registerAnalyticsRoutes(router) {
  router.get('/api/v1/environment-temperature', async (req, res) => {
    if (!req.auth) throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
    const url = new URL(req.url || '/', 'http://localhost');
    const date = optionalString(url.searchParams.get('date'), 'date', { max: 10 });
    if (date && !validDateKey(date)) throw new ValidationError('`date` must be a valid YYYY-MM-DD date');
    const result = await getEnvironmentTemperature(date);
    sendOk(res, result ? { ...result, value: result.temperatureC } : { date, value:null, status:'unavailable' });
  });

  router.get('/api/v1/raw-data-samples', async (req, res) => {
    if (!req.auth) throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
    const vendorAccountId = vendorAccountIdForSession(req.auth);
    if (!vendorAccountId) throw forbiddenAccount();

    const url = new URL(req.url || '/', 'http://localhost');
    const page = optionalInt(url.searchParams.get('page'), 'page', { min: 1, max: 1000000 }) || 1;
    const pageSize = optionalInt(url.searchParams.get('pageSize'), 'pageSize', { min: 1, max: 30 }) || 30;
    const range = rawSampleRange(url);
    const role = req.auth.user.role;
    let includeAllAccounts = false;
    let deviceIds = null;

    if (role === 'master_admin') {
      includeAllAccounts = true;
      const clientId = optionalString(url.searchParams.get('clientId'), 'clientId', { max: 160 });
      const machineId = optionalString(url.searchParams.get('machineId'), 'machineId', { max: 160 });
      deviceIds = clientId || machineId ? await resolveVendorDeviceIds({ clientId, machineId }) : null;
    } else if (role === 'client_admin') {
      const machineId = optionalString(url.searchParams.get('machineId'), 'machineId', { max: 160 });
      const clientRef = optionalString(url.searchParams.get('clientId'), 'clientId', { max: 160 });
      const resolved = await resolveClientAdminDeviceScope(req, vendorAccountId, { clientRef, machineId });
      deviceIds = resolved.deviceIds;
    } else if (role === 'user') {
      const assignedMachineIds = req.auth.user.machineIds?.length
        ? req.auth.user.machineIds
        : (req.auth.user.machineId ? [req.auth.user.machineId] : []);
      if (!assignedMachineIds.length) throw forbiddenAccount();
      const requestedMachine = optionalString(
        url.searchParams.get('machineId') ?? url.searchParams.get('machine'),
        'machineId',
        { max: 160 }
      );
      const scope = analyticsScopeForUser(
        { ...req.auth.user, machineIds: assignedMachineIds },
        { machineId: requestedMachine }
      );
      deviceIds = await resolveVendorDeviceIds({
        machineIds: scope.machineIds,
      });
    } else {
      throw forbiddenAccount();
    }

    const result = await loadVendorTelemetrySamples({
      vendorAccountId,
      includeAllAccounts,
      deviceIds,
      start: range.start,
      end: range.end,
      page,
      pageSize,
    });
    sendOk(res, { ...result, range, source: 'worker' });
  });
  router.get('/api/v1/graphs/food-waste', async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const context = await analyticsContext(req, url);
    const period = optionalString(url.searchParams.get('period'), 'period', { max: 10 }) || 'monthly';
    if (!PERIODS.has(period)) throw new ValidationError('`period` must be daily, monthly, or yearly');
    const range = dateRangeForRequest(url, period, new Date());
    const requestedGroup = optionalString(url.searchParams.get('groupBy'), 'groupBy', { max: 10 });
    const groupBy = requestedGroup || defaultGroupBy(period);
    if (!GROUPS.has(groupBy)) throw new ValidationError('`groupBy` must be hour, day, or month');
    const sourceGroupBy = groupBy === 'hour' ? 'hour' : 'day';

    const analytics = await loadGraphAnalytics(context, range, sourceGroupBy);
    const region = await resolveReportRegion({ clientId: context.clientId });
    const result = aggregateTelemetrySnapshots(analytics.rows, {
      groupBy,
      start: range.start,
      end: range.end,
      region,
      summaryMode: period,
      now: new Date(),
      formula: config.formula,
      wasteSource: 'daily-input',
    });
    sendOk(res, {
      period,
      groupBy,
      range,
      items: result.items,
      ghgItems: result.ghgItems,
      energyItems: result.energyItems,
      tempItems: result.tempItems,
      humidityItems: result.humidityItems,
      summary: result.summary,
      empty: result.summary.pointCount === 0,
      dataSources: analytics.dataSources,
    }, undefined, ANALYTICS_CACHE_HEADERS);
  });

  router.get('/api/v1/graphs', async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const context = await analyticsContext(req, url);
    const period = optionalString(url.searchParams.get('period'), 'period', { max: 10 }) || 'monthly';
    if (!PERIODS.has(period)) throw new ValidationError('`period` must be daily, monthly, or yearly');
    const range = dateRangeForRequest(url, period, new Date());
    const groupBy = defaultGroupBy(period);
    const sourceGroupBy = groupBy === 'hour' ? 'hour' : 'day';
    const analytics = await loadGraphAnalytics(context, range, sourceGroupBy);
    const region = await resolveReportRegion({ clientId: context.clientId });
    const result = aggregateTelemetrySnapshots(analytics.rows, {
      groupBy,
      start: range.start,
      end: range.end,
      region,
      summaryMode: period,
      now: new Date(),
      formula: config.formula,
      wasteSource: 'daily-input',
    });
    const weightGraph = aggregateWeightGraph(analytics.rows, {
      period,
      start: range.start,
      end: range.end,
      formula: config.formula,
    });
    sendOk(res, {
      period,
      groupBy,
      range,
      items:weightGraph.items,
      ghgItems:weightGraph.ghgItems,
      energyItems:result.energyItems,
      tempItems:result.tempItems,
      humidityItems:result.humidityItems,
      summary:{
        ...result.summary,
        wasteKg:weightGraph.summary.averageKg,
        wasteInAverageKg:weightGraph.summary.averageKg,
        wasteInTotalKg:weightGraph.summary.totalKg,
        pointCount:weightGraph.items.filter((item) => item.value !== null).length,
      },
      empty:weightGraph.items.every((item) => item.value === null),
      weightSource:'absolute-daily-average',
      dataSources: analytics.dataSources,
    }, undefined, ANALYTICS_CACHE_HEADERS);
  });

  router.get('/api/v1/reports', async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const context = await analyticsContext(req, url);
    const period = optionalString(url.searchParams.get('period'), 'period', { max: 10 }) || 'monthly';
    if (!PERIODS.has(period) || period === 'daily') {
      throw new ValidationError('Report `period` must be monthly or yearly');
    }
    const range = dateRangeForRequest(url, period, new Date());
    const groupBy = period === 'yearly' ? 'month' : 'day';
    const sourceGroupBy = 'day';
    const analytics = await loadReportAnalytics(req, context, range);
    const region = await resolveReportRegion({ clientId: context.clientId });
    const summaryResult = aggregateTelemetrySnapshots(analytics.rows, {
      groupBy,
      start: range.start,
      end: range.end,
      region,
      summaryMode: period,
      now: new Date(),
      formula: config.formula,
      wasteSource: 'daily-stats',
    });
    const foodWasteResult = aggregateTelemetrySnapshots(analytics.telemetryRows, {
      groupBy,
      start: range.start,
      end: range.end,
      region,
      summaryMode: period,
      now: new Date(),
      formula: config.formula,
      wasteSource: 'daily-input',
    });
    const weightResult = aggregateReportWeightItems(analytics.telemetryRows, {
      period,
      start:range.start,
      end:range.end,
    });
    const wasteInAverageKg = weightResult.summary.averageKg;
    const wasteInTotalKg = weightResult.summary.totalKg;
    const fixedCarbonKg = summaryResult.summary.fixedCarbonKg;
    const ghgKg = reportGhgFromWeight(wasteInTotalKg, fixedCarbonKg, config.formula.wasteReductionFactor);
    sendOk(res, {
      period,
      range,
      groupBy,
      title: period === 'yearly' ? 'Yearly Report' : 'Monthly Report',
      items: foodWasteResult.items,
      foodWasteSource: 'daily-input',
      weightItems: weightResult.items,
      weightSummary: weightResult.summary,
      weightSource: 'absolute-daily-average',
      ghgItems: summaryResult.ghgItems,
      energyItems: summaryResult.energyItems,
      tempItems: summaryResult.tempItems,
      humidityItems: summaryResult.humidityItems,
      summary: {
        ...summaryResult.summary,
        wasteKg:wasteInTotalKg,
        wasteInAverageKg,
        wasteInTotalKg,
        ghgKg,
        fertilizerKg:fertilizerKg(wasteInTotalKg, config.formula),
      },
      empty: summaryResult.summary.pointCount === 0,
      dataSources: analytics.dataSources,
    }, undefined, ANALYTICS_CACHE_HEADERS);
  });
}
