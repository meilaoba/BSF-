import { config } from '../config.js';
import { AppError, ProviderError, ValidationError } from '../lib/errors.js';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_PAGE_SIZE = 10;

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

function integer(value, { min, max } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  if (min !== undefined && number < min) return null;
  if (max !== undefined && number > max) return null;
  return number;
}

function coordinate(value, min, max) {
  const number = finiteNumber(value);
  return number !== null && number >= min && number <= max ? number : null;
}

function safeImageUrl(value) {
  const raw = cleanText(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function telemetry(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function mapVendorDevice(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;

  const createdAt = integer(record.createTime, { min: 0 });
  return {
    id: cleanText(record.id, 120),
    deviceName: cleanText(record.deviceName, 300),
    serialNumber: cleanText(record.deviceSerialNum, 160),
    deviceType: integer(record.deviceType),
    templateName: cleanText(record.templateName, 200),
    addressCode: cleanText(record.deviceAddress, 20),
    onlineCode: integer(record.deviceOnline),
    latitude: coordinate(record.deviceLatitude, -90, 90),
    longitude: coordinate(record.deviceLongitude, -180, 180),
    power: finiteNumber(record.devicePower),
    imageUrl: safeImageUrl(record.deviceImage),
    owner: {
      id: cleanText(record.userId, 120),
      userName: cleanText(record.userName, 200),
    },
    telemetry: telemetry(record.data),
    createdAt: createdAt === null ? null : new Date(createdAt).toISOString(),
  };
}

export function normalizeDeviceListResponse(body, { requestedPageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProviderError('VENDOR_DEVICE_INVALID_RESPONSE', 'Vendor device service returned invalid JSON', {
      status: 502,
    });
  }
  if (Number(body.code) === 401 || Number(body.code) === 403) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', {
      status: 401,
    });
  }
  if (Number(body.code) !== 200) {
    throw new ProviderError('VENDOR_DEVICE_LIST_REJECTED', 'Vendor device service rejected the request', {
      status: 502,
    });
  }

  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.records)) {
    throw new ProviderError('VENDOR_DEVICE_INVALID_RESPONSE', 'Vendor device response is missing records', {
      status: 502,
    });
  }

  const records = data.records.map(mapVendorDevice).filter(Boolean);
  return {
    records,
    pagination: {
      current: integer(data.current, { min: 1 }) ?? 1,
      total: integer(data.total, { min: 0 }) ?? records.length,
      pages: integer(data.pages, { min: 0 }) ?? 0,
      pageSize: integer(data.pageSize, { min: 1, max: 100 }) ?? requestedPageSize,
    },
  };
}

function validateVendorUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.deviceListUrl);
  } catch {
    throw new AppError('DEVICE_API_CONFIGURATION_ERROR', 'Vendor device API URL is invalid', { status: 503 });
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new AppError('DEVICE_API_CONFIGURATION_ERROR', 'Vendor device API URL is not allowed', { status: 503 });
  }
  if (config.env === 'production' && url.protocol !== 'https:') {
    throw new AppError('DEVICE_API_CONFIGURATION_ERROR', 'Vendor device API URL must use HTTPS', { status: 503 });
  }
  return url;
}

function normalizeRequest(input) {
  const token = cleanText(input.token, 8192);
  if (!token) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session is unavailable. Please sign in again.', {
      status: 401,
    });
  }

  const pageSize = integer(input.pageSize ?? DEFAULT_PAGE_SIZE, { min: 1, max: 100 });
  const pageNum = integer(input.pageNum ?? 1, { min: 1, max: 10000 });
  if (pageSize === null) throw new ValidationError('`pageSize` must be an integer from 1 to 100');
  if (pageNum === null) throw new ValidationError('`pageNum` must be an integer from 1 to 10000');

  const equipName = cleanText(input.equipName, 200);
  const deviceAddress = cleanText(input.deviceAddress, 20);
  const deviceOnline = input.deviceOnline === undefined || input.deviceOnline === null || input.deviceOnline === ''
    ? null
    : integer(input.deviceOnline, { min: 0 });
  if (input.deviceOnline !== undefined
    && input.deviceOnline !== null
    && input.deviceOnline !== ''
    && deviceOnline === null) {
    throw new ValidationError('`deviceOnline` must be a non-negative integer');
  }

  return {
    token,
    payload: {
      pageSize: String(pageSize),
      pageNum: String(pageNum),
      ...(equipName ? { equipName } : {}),
      ...(deviceAddress ? { deviceAddress } : {}),
      ...(deviceOnline !== null ? { deviceOnline } : {}),
    },
    pageSize,
  };
}

async function readLimitedJson(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ProviderError('VENDOR_DEVICE_RESPONSE_TOO_LARGE', 'Vendor device response was too large', {
      status: 502,
    });
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ProviderError('VENDOR_DEVICE_INVALID_RESPONSE', 'Vendor device service returned an empty response', {
      status: 502,
    });
  }

  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProviderError('VENDOR_DEVICE_RESPONSE_TOO_LARGE', 'Vendor device response was too large', {
          status: 502,
        });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ProviderError('VENDOR_DEVICE_INVALID_RESPONSE', 'Vendor device service returned invalid JSON', {
      status: 502,
    });
  }
}

/**
 * Reads the vendor device list using the token encrypted in the current
 * server-side session. The vendor token never leaves the backend.
 */
export async function listVendorDevices(input) {
  const request = normalizeRequest(input || {});
  const url = validateVendorUrl();
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(Number(config.auth.vendor.deviceTimeoutMs) || 15000, 60000));
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
        token: request.token,
      },
      body: JSON.stringify(request.payload),
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ProviderError('VENDOR_DEVICE_TIMEOUT', 'Vendor device service timed out', { status: 504 });
    }
    throw new ProviderError('VENDOR_DEVICE_UNAVAILABLE', 'Vendor device service is unavailable', {
      status: 503,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => {});
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', {
      status: 401,
    });
  }
  if (response.status === 429) {
    await response.body?.cancel().catch(() => {});
    throw new ProviderError('VENDOR_RATE_LIMITED', 'Vendor device service is busy. Please retry later.', {
      status: 429,
    });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ProviderError('VENDOR_DEVICE_UNAVAILABLE', 'Vendor device service is unavailable', {
      status: 502,
    });
  }

  const body = await readLimitedJson(response);
  return normalizeDeviceListResponse(body, { requestedPageSize: request.pageSize });
}
