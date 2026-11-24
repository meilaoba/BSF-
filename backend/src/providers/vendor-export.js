import { config } from '../config.js';
import { AppError, ProviderError } from '../lib/errors.js';

const MAX_EXPORT_BYTES = 100 * 1024 * 1024;

function exportUrl(kind) {
  const raw = kind === 'alarms'
    ? config.auth.vendor.faultExportUrl
    : config.auth.vendor.deviceExportUrl;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('VENDOR_EXPORT_CONFIGURATION_ERROR', 'Vendor export URL is invalid', { status: 503 });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AppError('VENDOR_EXPORT_CONFIGURATION_ERROR', 'Vendor export URL is not allowed', { status: 503 });
  }
  const localHttp = config.env !== 'production' && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new AppError('VENDOR_EXPORT_CONFIGURATION_ERROR', 'Vendor export URL must use HTTPS', { status: 503 });
  }
  return url;
}

function cleanFilename(value, fallback) {
  const raw = String(value || '').match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  const name = raw ? decodeURIComponent(raw[1].replace(/"/g, '')) : fallback;
  return String(name || fallback).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
}

export async function fetchVendorExport({
  kind,
  token,
  deviceName = '',
  deviceSerialNum = '',
  startTime = '',
  endTime = '',
  timeoutMs = 30000,
} = {}) {
  if (!token) throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session is unavailable', { status: 401 });
  if (!['device-data', 'alarms'].includes(kind)) {
    throw new AppError('VENDOR_EXPORT_CONFIGURATION_ERROR', 'Unsupported vendor export type', { status: 400 });
  }
  if (kind === 'device-data' && !deviceName) {
    throw new AppError('VALIDATION_ERROR', '`deviceName` is required for device data export', { status: 422 });
  }

  const url = exportUrl(kind);
  url.searchParams.set('token', token);
  if (deviceName) url.searchParams.set('deviceName', deviceName);
  if (kind === 'device-data' && deviceSerialNum) url.searchParams.set('deviceSerialNum', deviceSerialNum);
  if (kind === 'device-data' && startTime) url.searchParams.set('startTime', startTime);
  if (kind === 'device-data' && endTime) url.searchParams.set('endTime', endTime);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(Number(timeoutMs) || 30000, 120000)));
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream' },
    });
    const contentLength = Number(response.headers.get('content-length')) || 0;
    if (contentLength > MAX_EXPORT_BYTES) {
      throw new ProviderError('VENDOR_EXPORT_TOO_LARGE', 'Vendor export is too large', { status: 502 });
    }
    if (!response.ok) {
      throw new ProviderError('VENDOR_EXPORT_UNAVAILABLE', 'Vendor export service is unavailable', { status: 502 });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      throw new ProviderError('VENDOR_EXPORT_EMPTY', 'Vendor export returned an empty file', { status: 502 });
    }
    if (bytes.length > MAX_EXPORT_BYTES) {
      throw new ProviderError('VENDOR_EXPORT_TOO_LARGE', 'Vendor export is too large', { status: 502 });
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('json') || contentType.includes('text/html')) {
      throw new ProviderError('VENDOR_EXPORT_INVALID_RESPONSE', 'Vendor export returned an invalid file', { status: 502 });
    }
    return {
      bytes,
      contentType: contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: cleanFilename(
        response.headers.get('content-disposition'),
        kind === 'alarms' ? 'AlarmRecord.xlsx' : 'DeviceData.xlsx'
      ),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ProviderError('VENDOR_EXPORT_TIMEOUT', 'Vendor export timed out', { status: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
