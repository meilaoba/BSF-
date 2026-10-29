import { AppError, ValidationError } from '../lib/errors.js';
import { sendOk } from '../lib/http.js';
import { optionalInt, optionalString } from '../lib/validate.js';
import { config } from '../config.js';
import {
  aggregateTelemetrySnapshots,
  periodRange,
} from '../shared/metrics.js';
import {
  loadVendorTelemetrySamples,
  loadVendorTelemetrySummaries,
  resolveReportRegion,
  resolveVendorDeviceIds,
  vendorAccountIdForSession,
} from '../services/vendor-analytics.js';

const PERIODS = new Set(['daily', 'monthly', 'yearly']);
const GROUPS = new Set(['hour', 'day', 'month']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDateKey(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateRangeForRequest(url, period, now) {
  const requestedStart = optionalString(url.searchParams.get('start'), 'start', { max: 10 });
  const requestedEnd = optionalString(url.searchParams.get('end'), 'end', { max: 10 });
  const requestedDate = optionalString(url.searchParams.get('date'), 'date', { max: 10 });
  const year = optionalInt(url.searchParams.get('year'), 'year', { min: 2000, max: 2100 });
  const month = optionalInt(url.searchParams.get('month'), 'month', { min: 1, max: 12 });
  if (requestedStart && !validDateKey(requestedStart)) throw new ValidationError('`start` must be a valid YYYY-MM-DD date');
  if (requestedEnd && !validDateKey(requestedEnd)) throw new ValidationError('`end` must be a valid YYYY-MM-DD date');
  if (requestedDate && !validDateKey(requestedDate)) throw new ValidationError('`date` must be a valid YYYY-MM-DD date');

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
    return scope.clientId || scope.machineId
      ? { clientId: scope.clientId || null, machineId: scope.machineId || null }
      : null;
  }
  if (scope.role === 'user') {
    return scope.machineId
      ? { clientId: scope.clientId || null, machineId: scope.machineId }
      : null;
  }
  if (scope.role === 'client_admin') {
    return scope.clientId
      ? { clientId: scope.clientId, machineId: scope.machineId || null }
      : null;
  }
  return null;
}

export function analyticsScopeForUser(user, requested = {}) {
  const role = user?.role;
  if (role === 'client_admin') {
    if (!user.clientId) throw forbiddenAccount();
    return { role, clientId: user.clientId, machineId: requested.machineId || null };
  }
  if (role === 'user') {
    if (!user.machineId) throw forbiddenAccount();
    return { role, clientId: user.clientId || null, machineId: user.machineId };
  }
  if (role !== 'master_admin') throw forbiddenAccount();
  return {
    role,
    clientId: requested.clientId || null,
    machineId: requested.machineId || null,
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
  const effectiveClient = scope.clientId;
  const effectiveMachine = scope.machineId;

  const lookup = analyticsDeviceLookup(scope);
  const deviceIds = lookup
    ? await resolveVendorDeviceIds(lookup)
    : null;

  return {
    role,
    vendorAccountId,
    includeAllAccounts: role === 'master_admin',
    deviceIds,
    clientId: effectiveClient,
    machineId: effectiveMachine,
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
      if (!req.auth.user.clientId) throw forbiddenAccount();
      const machineId = optionalString(url.searchParams.get('machineId'), 'machineId', { max: 160 });
      deviceIds = await resolveVendorDeviceIds({ clientId: req.auth.user.clientId, machineId });
    } else if (role === 'user') {
      if (!req.auth.user.machineId) throw forbiddenAccount();
      deviceIds = await resolveVendorDeviceIds({
        clientId: req.auth.user.clientId || null,
        machineId: req.auth.user.machineId,
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

    const rows = await loadVendorTelemetrySummaries({
      vendorAccountId: context.vendorAccountId,
      includeAllAccounts: context.includeAllAccounts,
      deviceIds: context.deviceIds,
      start: range.start,
      end: range.end,
      groupBy,
    });
    const region = await resolveReportRegion({ clientId: context.clientId });
    const result = aggregateTelemetrySnapshots(rows, {
      groupBy,
      start: range.start,
      end: range.end,
      region,
      summaryMode: period,
      now: new Date(),
      formula: config.formula,
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
    });
  });

  router.get('/api/v1/graphs', async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const context = await analyticsContext(req, url);
    const period = optionalString(url.searchParams.get('period'), 'period', { max: 10 }) || 'monthly';
    if (!PERIODS.has(period)) throw new ValidationError('`period` must be daily, monthly, or yearly');
    const range = dateRangeForRequest(url, period, new Date());
    const groupBy = defaultGroupBy(period);
    const rows = await loadVendorTelemetrySummaries({
      vendorAccountId: context.vendorAccountId,
      includeAllAccounts: context.includeAllAccounts,
      deviceIds: context.deviceIds,
      start: range.start,
      end: range.end,
      groupBy,
    });
    const region = await resolveReportRegion({ clientId: context.clientId });
    const result = aggregateTelemetrySnapshots(rows, {
      groupBy,
      start: range.start,
      end: range.end,
      region,
      summaryMode: period,
      now: new Date(),
      formula: config.formula,
    });
    sendOk(res, { period, groupBy, range, ...result, empty: result.summary.pointCount === 0 });
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
    const rows = await loadVendorTelemetrySummaries({
      vendorAccountId: context.vendorAccountId,
      includeAllAccounts: context.includeAllAccounts,
      deviceIds: context.deviceIds,
      start: range.start,
      end: range.end,
      groupBy,
    });
    const region = await resolveReportRegion({ clientId: context.clientId });
    const result = aggregateTelemetrySnapshots(rows, {
      groupBy,
      start: range.start,
      end: range.end,
      region,
      summaryMode: period,
      now: new Date(),
      formula: config.formula,
    });
    sendOk(res, {
      period,
      range,
      groupBy,
      title: period === 'yearly' ? 'Yearly Report' : 'Monthly Report',
      items: result.items,
      ghgItems: result.ghgItems,
      energyItems: result.energyItems,
      tempItems: result.tempItems,
      humidityItems: result.humidityItems,
      summary: result.summary,
      empty: result.summary.pointCount === 0,
    });
  });
}
