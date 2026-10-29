import { config } from '../config.js';
import { httpRequest } from './http-client.js';
import { ProviderError, ValidationError } from '../lib/errors.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateHttpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError('HKO_CONFIGURATION_ERROR', `${label} is invalid`, { status: 503 });
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ProviderError('HKO_CONFIGURATION_ERROR', `${label} must use HTTPS`, { status: 503 });
  }
  return url;
}

function validDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function fetchHkoCurrentTemperature() {
  const url = validateHttpUrl(config.environment.hkoCurrentTemperatureUrl, 'HKO current temperature URL');
  const response = await httpRequest({
    url: url.toString(),
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'BSF-platform/1.0' },
    timeoutMs: config.environment.hkoTimeoutMs,
    provider: 'Hong Kong Observatory',
  });
  return normalizeHkoCurrentResponse(response.body);
}

export function normalizeHkoCurrentResponse(body) {
  const readings = body?.temperature?.data;
  if (!Array.isArray(readings)) {
    throw new ProviderError('HKO_INVALID_RESPONSE', 'HKO temperature data is missing', { status: 502 });
  }
  const station = readings.find((row) => String(row?.place || '').trim() === config.environment.hkoStationName);
  const temperature = Number(station?.value);
  const observedAt = new Date(body?.temperature?.recordTime || body?.updateTime || '');
  if (!station || !Number.isFinite(temperature) || !Number.isFinite(observedAt.getTime())) {
    throw new ProviderError('HKO_INVALID_RESPONSE', 'HKO Observatory temperature is unavailable', { status: 502 });
  }
  return {
    station: config.environment.hkoStation,
    stationName: config.environment.hkoStationName,
    temperatureC: temperature,
    observedAt,
    source: 'hko_rhrread',
  };
}

export async function fetchHkoOfficialDailyMean(dateKey) {
  if (!validDate(dateKey)) throw new ValidationError('`date` must be a valid YYYY-MM-DD date');
  const [year, month, day] = dateKey.split('-').map(Number);
  const url = validateHttpUrl(config.environment.hkoDailyTemperatureUrl, 'HKO daily temperature URL');
  url.searchParams.set('year', String(year));
  url.searchParams.set('month', String(month));
  url.searchParams.set('day', String(day));
  url.searchParams.set('station', config.environment.hkoStation);
  const response = await httpRequest({
    url: url.toString(),
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'BSF-platform/1.0' },
    timeoutMs: config.environment.hkoTimeoutMs,
    provider: 'Hong Kong Observatory',
  });
  return normalizeHkoOfficialDailyResponse(response.body, dateKey);
}

export function normalizeHkoOfficialDailyResponse(body, dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!Array.isArray(body?.data)) {
    throw new ProviderError('HKO_INVALID_RESPONSE', 'HKO daily temperature data is missing', { status: 502 });
  }
  const row = body.data.find((item) => {
    if (!Array.isArray(item) || item.length < 4) return false;
    return Number(item[0]) === year && Number(item[1]) === month && Number(item[2]) === day;
  });
  const value = Number(row?.[3]);
  if (!row || !Number.isFinite(value)) return null;
  return {
    station: config.environment.hkoStation,
    stationName: config.environment.hkoStationName,
    date: dateKey,
    temperatureC: value,
    completeness: row[4] || null,
    source: 'hko_clmtemp',
  };
}
