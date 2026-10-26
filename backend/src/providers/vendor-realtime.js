import WebSocket from 'ws';
import { config } from '../config.js';
import { ProviderError, ValidationError } from '../lib/errors.js';

const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
const MAX_TELEMETRY_KEYS = 256;
const MAX_TELEMETRY_KEY_LENGTH = 128;

function cleanIdentifier(value, max = 160) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function finiteInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function sanitizeTelemetry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const clean = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (count >= MAX_TELEMETRY_KEYS) break;
    const key = String(rawKey).trim();
    if (!key || key.length > MAX_TELEMETRY_KEY_LENGTH) continue;
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    if (!['string', 'number', 'boolean'].includes(typeof rawValue) && rawValue !== null) continue;
    if (typeof rawValue === 'string' && rawValue.length > 500) continue;
    clean[key] = rawValue;
    count += 1;
  }
  return Object.keys(clean).length ? clean : null;
}

function candidatesFromMessage(message) {
  if (Array.isArray(message)) return message;
  if (!message || typeof message !== 'object') return [];
  if (message.type === 'HEARTBEAT') return [];
  if (message.data && typeof message.data === 'object' && !Array.isArray(message.data)) {
    return [{
      id: message.deviceId ?? message.deviceSerialNum ?? message.id,
      deviceSerialNum: message.deviceSerialNum,
      deviceOnline: message.deviceOnline,
      data: message.data,
    }];
  }
  if (message.id !== undefined && message.data !== undefined) return [message];
  return [];
}

export function normalizeRealtimeMessage(message, devices) {
  const byId = new Map();
  const bySerial = new Map();
  for (const device of devices) {
    const id = cleanIdentifier(device?.id);
    const serial = cleanIdentifier(device?.serialNumber);
    if (id) byId.set(id, device);
    if (serial) bySerial.set(serial, device);
  }

  const normalized = [];
  for (const candidate of candidatesFromMessage(message)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const id = cleanIdentifier(candidate.id);
    const serial = cleanIdentifier(candidate.deviceSerialNum ?? candidate.serialNumber);
    const device = (id && byId.get(id)) || (serial && bySerial.get(serial));
    if (!device) continue;
    const telemetry = sanitizeTelemetry(candidate.data);
    if (!telemetry) continue;
    normalized.push({
      id: cleanIdentifier(device.id),
      serialNumber: cleanIdentifier(device.serialNumber),
      onlineCode: finiteInteger(candidate.deviceOnline),
      telemetry,
    });
  }
  return normalized;
}

function validateSocketUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.realtimeUrl);
  } catch {
    throw new ProviderError('VENDOR_REALTIME_CONFIGURATION_ERROR', 'Vendor realtime service URL is invalid', {
      status: 503,
      retryable: false,
    });
  }
  const validProtocol = url.protocol === 'wss:' || (config.env !== 'production' && url.protocol === 'ws:');
  if (!validProtocol || url.username || url.password || url.hash) {
    throw new ProviderError('VENDOR_REALTIME_CONFIGURATION_ERROR', 'Vendor realtime service URL is not allowed', {
      status: 503,
      retryable: false,
    });
  }
  return url;
}

/**
 * Reads one authoritative realtime snapshot for the supplied, already-authorized
 * vendor devices. The vendor token stays in the backend and the returned records
 * are filtered against the REST device list to prevent cross-device leakage.
 */
export function fetchVendorRealtimeDevices({ token, devices, timeoutMs } = {}) {
  const accessToken = cleanIdentifier(token, 8192);
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!Array.isArray(devices)) throw new ValidationError('`devices` must be an array');
  const requested = devices.filter((device) => cleanIdentifier(device?.id));
  if (!requested.length) return Promise.resolve(new Map());

  const url = validateSocketUrl();
  url.searchParams.set('token', accessToken);
  const maxTimeout = Math.max(1000, Math.min(Number(timeoutMs || config.auth.vendor.realtimeTimeoutMs) || 4000, 15000));

  return new Promise((resolve, reject) => {
    let settled = false;
    let connected = false;
    let socket;
    const found = new Map();

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      if (error) reject(error);
      else resolve(found);
    };

    const timer = setTimeout(() => {
      if (found.size) finish();
      else finish(new ProviderError('VENDOR_REALTIME_TIMEOUT', 'Vendor realtime service timed out', { status: 504 }));
    }, maxTimeout);

    try {
      socket = new WebSocket(url, { maxPayload: MAX_MESSAGE_BYTES, handshakeTimeout: maxTimeout });
    } catch {
      finish(new ProviderError('VENDOR_REALTIME_UNAVAILABLE', 'Vendor realtime service is unavailable', { status: 503 }));
      return;
    }

    socket.on('open', () => {
      connected = true;
      for (const device of requested) {
        socket.send(JSON.stringify({ deviceId: String(device.id) }));
      }
    });

    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      let message;
      try {
        message = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      } catch {
        return;
      }
      for (const record of normalizeRealtimeMessage(message, requested)) {
        found.set(record.id, record);
      }
      if (found.size >= requested.length) finish();
    });

    socket.on('error', () => {
      if (!connected || !found.size) {
        finish(new ProviderError('VENDOR_REALTIME_UNAVAILABLE', 'Vendor realtime service is unavailable', { status: 503 }));
      }
    });

    socket.on('close', () => {
      if (settled) return;
      if (found.size) finish();
      else finish(new ProviderError('VENDOR_REALTIME_UNAVAILABLE', 'Vendor realtime service closed without data', { status: 503 }));
    });
  });
}

export function mergeRealtimeDevices(records, liveByDeviceId) {
  const now = new Date().toISOString();
  return records.map((record) => {
    const live = liveByDeviceId.get(String(record.id));
    if (!live) return record;
    return {
      ...record,
      onlineCode: live.onlineCode ?? record.onlineCode,
      telemetry: { ...(record.telemetry || {}), ...live.telemetry },
      lastSyncedAt: now,
      realtime: true,
    };
  });
}
