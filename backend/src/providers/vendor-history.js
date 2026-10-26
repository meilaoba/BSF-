import { config } from '../config.js';
import { AppError, ProviderError, ValidationError } from '../lib/errors.js';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_RANGE_DAYS = 366;
const VENDOR_CHUNK_DAYS = 30;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function parseDateOnly(value, field) {
  const text = cleanText(value, 20);
  if (!text || !DATE_ONLY.test(text)) throw new ValidationError(`\`${field}\` must use YYYY-MM-DD`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new ValidationError(`\`${field}\` is not a valid date`);
  }
  return { text, date };
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

export function validateHistoryRange(startValue, endValue) {
  const start = parseDateOnly(startValue, 'start');
  const end = parseDateOnly(endValue, 'end');
  const span = Math.round((end.date.getTime() - start.date.getTime()) / 86400000);
  if (span < 0) throw new ValidationError('`end` must not be before `start`');
  if (span > MAX_RANGE_DAYS) throw new ValidationError(`History range cannot exceed ${MAX_RANGE_DAYS} days`);
  return { start: start.text, end: end.text, span };
}

export function chunkHistoryRange(start, end) {
  const range = validateHistoryRange(start, end);
  const chunks = [];
  const endDate = new Date(`${range.end}T00:00:00.000Z`);
  let cursor = new Date(`${range.start}T00:00:00.000Z`);
  while (cursor <= endDate) {
    const chunkEnd = addUtcDays(cursor, VENDOR_CHUNK_DAYS - 1);
    const boundedEnd = chunkEnd < endDate ? chunkEnd : endDate;
    chunks.push({ start: formatUtcDate(cursor), end: formatUtcDate(boundedEnd) });
    cursor = addUtcDays(boundedEnd, 1);
  }
  return chunks;
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampText(value) {
  const text = cleanText(value, 40);
  if (!text) return null;
  const normalized = text.replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(normalized)) return normalized.slice(0, 16);
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeHistoryResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProviderError('VENDOR_HISTORY_INVALID_RESPONSE', 'Vendor history service returned invalid JSON');
  }
  if (Number(body.code) === 401 || Number(body.code) === 403) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', { status: 401 });
  }
  if (Number(body.code) !== 200) {
    throw new ProviderError('VENDOR_HISTORY_REJECTED', 'Vendor history service rejected the request');
  }

  const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : null;
  if (!data) throw new ProviderError('VENDOR_HISTORY_INVALID_RESPONSE', 'Vendor history response is missing data');
  const times = Array.isArray(data.time) ? data.time : [];
  const temperatures = Array.isArray(data.temperature) ? data.temperature : [];
  const humidities = Array.isArray(data.humidity) ? data.humidity : [];
  const length = Math.min(times.length, Math.max(temperatures.length, humidities.length));
  const rows = [];
  for (let index = 0; index < length; index += 1) {
    const recordedAt = timestampText(times[index]);
    if (!recordedAt) continue;
    const temperature = finiteNumber(temperatures[index]);
    const humidity = finiteNumber(humidities[index]);
    if (temperature === null && humidity === null) continue;
    rows.push({ recordedAt, temperature, humidity });
  }
  return rows;
}

function validateHistoryUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.historyUrl);
  } catch {
    throw new AppError('VENDOR_HISTORY_CONFIGURATION_ERROR', 'Vendor history API URL is invalid', { status: 503 });
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new AppError('VENDOR_HISTORY_CONFIGURATION_ERROR', 'Vendor history API URL is not allowed', { status: 503 });
  }
  if (config.env === 'production' && url.protocol !== 'https:') {
    throw new AppError('VENDOR_HISTORY_CONFIGURATION_ERROR', 'Vendor history API URL must use HTTPS', { status: 503 });
  }
  return url;
}

async function readLimitedJson(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ProviderError('VENDOR_HISTORY_RESPONSE_TOO_LARGE', 'Vendor history response was too large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('VENDOR_HISTORY_INVALID_RESPONSE', 'Vendor history response was empty');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProviderError('VENDOR_HISTORY_RESPONSE_TOO_LARGE', 'Vendor history response was too large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ProviderError('VENDOR_HISTORY_INVALID_RESPONSE', 'Vendor history service returned invalid JSON');
  }
}

async function fetchHistoryChunk({ token, deviceSerialNum, start, end }) {
  const url = validateHistoryUrl();
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(Number(config.auth.vendor.historyTimeoutMs) || 15000, 60000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        token,
      },
      body: JSON.stringify({ deviceSerialNum, startTime: start, endTime: end }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ProviderError('VENDOR_HISTORY_TIMEOUT', 'Vendor history service timed out', { status: 504 });
    }
    throw new ProviderError('VENDOR_HISTORY_UNAVAILABLE', 'Vendor history service is unavailable', { status: 503 });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => {});
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', { status: 401 });
  }
  if (response.status === 429) {
    await response.body?.cancel().catch(() => {});
    throw new ProviderError('VENDOR_RATE_LIMITED', 'Vendor history service is busy. Please retry later.', { status: 429 });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ProviderError('VENDOR_HISTORY_UNAVAILABLE', 'Vendor history service is unavailable', { status: 502 });
  }
  return normalizeHistoryResponse(await readLimitedJson(response));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function fetchVendorHistory({ token, deviceSerialNum, start, end }) {
  const accessToken = cleanText(token, 8192);
  const serial = cleanText(deviceSerialNum, 160);
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!serial) throw new ValidationError('`deviceSerialNum` is required');
  const chunks = chunkHistoryRange(start, end);
  const pages = await mapWithConcurrency(chunks, 3, (chunk) => fetchHistoryChunk({
    token: accessToken,
    deviceSerialNum: serial,
    start: chunk.start,
    end: chunk.end,
  }));
  const seen = new Set();
  const rows = [];
  for (const page of pages) {
    for (const row of page) {
      const key = row.recordedAt;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  rows.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  return rows;
}

export function aggregateHistoryRows(rows, groupBy = 'raw') {
  if (!['raw', 'hour', 'day', 'month'].includes(groupBy)) {
    throw new ValidationError('`groupBy` must be raw, hour, day, or month');
  }
  if (groupBy === 'raw') return rows;
  const groups = new Map();
  for (const row of rows) {
    const label = groupBy === 'hour'
      ? row.recordedAt.slice(0, 13) + ':00'
      : groupBy === 'day' ? row.recordedAt.slice(0, 10) : row.recordedAt.slice(0, 7);
    const group = groups.get(label) || { temperatureSum: 0, temperatureCount: 0, humiditySum: 0, humidityCount: 0 };
    if (row.temperature !== null) {
      group.temperatureSum += row.temperature;
      group.temperatureCount += 1;
    }
    if (row.humidity !== null) {
      group.humiditySum += row.humidity;
      group.humidityCount += 1;
    }
    groups.set(label, group);
  }
  return Array.from(groups.entries()).map(([recordedAt, group]) => ({
    recordedAt,
    temperature: group.temperatureCount ? group.temperatureSum / group.temperatureCount : null,
    humidity: group.humidityCount ? group.humiditySum / group.humidityCount : null,
  }));
}
