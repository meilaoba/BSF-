import { config } from '../config.js';
import { AppError, ProviderError, ValidationError } from '../lib/errors.js';
import { httpRequest } from './http-client.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function dateText(value) {
  const text = cleanText(value, 20);
  if (!text || !DATE_ONLY.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

export function normalizeDailyStatsResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProviderError('VENDOR_DAILY_STATS_INVALID_RESPONSE', 'Vendor daily stats service returned invalid JSON');
  }
  if ([401, 403].includes(Number(body.code))) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', { status: 401 });
  }
  if (Number(body.code) !== 200) {
    throw new ProviderError('VENDOR_DAILY_STATS_REJECTED', 'Vendor daily stats service rejected the request', { status: 502 });
  }
  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.records)) {
    throw new ProviderError('VENDOR_DAILY_STATS_INVALID_RESPONSE', 'Vendor daily stats response is missing records', { status: 502 });
  }

  return {
    records: data.records.map((record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
      const statDate = dateText(record.statDate);
      if (!statDate) return null;
      return {
        deviceSerialNumber: cleanText(record.deviceSerialNum, 160),
        deviceName: cleanText(record.deviceName, 300),
        statDate,
        runTime: finiteNumber(record.runTime),
        vendorSavedCarbon: finiteNumber(record.saveCarbon),
        kitchenWaste: finiteNumber(record.kitchenWaste),
        powerConsume: finiteNumber(record.powerConsume),
        deviceLocation: cleanText(record.deviceLocation, 300),
        unloadingWeight: finiteNumber(record.unloadingWeight),
        bindingTime: finiteNumber(record.bindingTime),
      };
    }).filter(Boolean),
    pagination: {
      total: integer(data.total) ?? 0,
      page: integer(data.pageNum) ?? 1,
      pageSize: integer(data.pageSize) ?? 20,
      totalPages: integer(data.totalPages) ?? 0,
    },
  };
}

function dailyStatsUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.dailyStatsUrl);
  } catch {
    throw new ProviderError('VENDOR_DAILY_STATS_CONFIGURATION_ERROR', 'Vendor daily stats URL is invalid', { status: 503 });
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (config.env === 'production' && url.protocol !== 'https:')) {
    throw new ProviderError('VENDOR_DAILY_STATS_CONFIGURATION_ERROR', 'Vendor daily stats URL is not allowed', { status: 503 });
  }
  return url;
}

export async function fetchVendorDailyStats({
  token,
  deviceName,
  startTime = '',
  endTime = '',
  pageNum = 1,
  pageSize = 20,
} = {}) {
  const accessToken = cleanText(token, 8192);
  const name = cleanText(deviceName, 300);
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!name) throw new ValidationError('`deviceName` is required');
  const response = await httpRequest({
    url: dailyStatsUrl().toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: {
      startTime: cleanText(startTime, 40) || '',
      endTime: cleanText(endTime, 40) || '',
      deviceName: name,
      pageSize,
      pageNum,
    },
    timeoutMs: config.auth.vendor.deviceTimeoutMs,
    provider: 'Vendor daily stats service',
  });
  return normalizeDailyStatsResponse(response.body);
}
