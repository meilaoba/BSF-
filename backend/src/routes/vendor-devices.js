import { config } from '../config.js';
import { AppError, NotFoundError, ValidationError } from '../lib/errors.js';
import { readJsonBody, sendOk } from '../lib/http.js';
import { optionalInt, optionalString } from '../lib/validate.js';
import { getVendorAccessToken } from '../middleware/session.js';
import { requireApiKey } from '../middleware/auth.js';
import { listAllVendorDevices, listVendorDevices } from '../providers/vendor-devices.js';
import { fetchVendorRealtimeDevices, mergeRealtimeDevices } from '../providers/vendor-realtime.js';
import { aggregateHistoryRows, fetchVendorHistory, validateHistoryRange } from '../providers/vendor-history.js';
import { upsertVendorDevices } from '../services/device-data.js';
import {
  loadLatestVendorTelemetrySnapshots,
  vendorAccountIdForSession,
} from '../services/vendor-analytics.js';
import { loadCollectorCredentials } from '../services/vendor-collector.js';

export function mergeLatestVendorTelemetry(devices, latestByDevice) {
  return devices.map((device) => {
    const latest = latestByDevice.get(String(device.id));
    if (!latest) return device;
    return {
      ...device,
      telemetry: { ...(latest.telemetry || {}), ...(device.telemetry || {}) },
      input: { ...(latest.input || {}), ...(device.input || {}) },
      output: { ...(latest.output || {}), ...(device.output || {}) },
      recordedAt: device.recordedAt || latest.recordedAt || latest.capturedAt,
      latestTelemetryAt: latest.capturedAt,
    };
  });
}

export function scopedDeviceForRole(device, role) {
  if (role === 'master_admin') return device;
  return {
    ...device,
    // Raw Data restricts its six visible columns in the UI. Machine cards need
    // the full authorized telemetry snapshot, so do not silently remove fields.
    input: undefined,
    output: undefined,
  };
}
export function registerVendorDeviceRoutes(router) {
  // Historical temperature/humidity is read-only and scoped through the same
  // vendor token. Requests are matched against the authorized device list.
  router.get('/api/v1/vendor-devices/history', async (req, res) => {
    if (!req.auth) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
    }

    const url = new URL(req.url || '/', 'http://localhost');
    const deviceId = optionalString(url.searchParams.get('deviceId'), 'deviceId', { max: 160 });
    const start = optionalString(url.searchParams.get('start'), 'start', { max: 20 });
    const end = optionalString(url.searchParams.get('end'), 'end', { max: 20 });
    const groupBy = optionalString(url.searchParams.get('groupBy'), 'groupBy', { max: 10 }) || 'raw';
    if (!deviceId) throw new ValidationError('deviceId is required');
    if (!['raw', 'hour', 'day', 'month'].includes(groupBy)) {
      throw new ValidationError('groupBy must be raw, hour, day, or month');
    }
    const range = validateHistoryRange(start, end);
    if (groupBy === 'raw' && range.span > 60) {
      throw new ValidationError('Raw history cannot span more than 60 days');
    }

    const token = await getVendorAccessToken(req.auth);
    const result = await listVendorDevices({ token, pageNum: 1, pageSize: 100 });
    const device = result.records.find((record) => (
      String(record.id) === String(deviceId) || String(record.serialNumber) === String(deviceId)
    ));
    if (!device) throw new NotFoundError('Vendor device not found');
    if (!device.serialNumber) throw new NotFoundError('Vendor device has no serial number');

    const rows = await fetchVendorHistory({
      token,
      deviceSerialNum: device.serialNumber,
      start: range.start,
      end: range.end,
    });
    const items = aggregateHistoryRows(rows, groupBy);
    sendOk(res, {
      deviceId: String(device.id),
      serialNumber: device.serialNumber,
      start: range.start,
      end: range.end,
      groupBy,
      count: items.length,
      items,
    });
  });

  // Read-only proxy. Authorization and tenant scope are supplied by the
  // signed-in vendor token; this route never creates local bindings.
  router.get('/api/v1/vendor-devices', async (req, res) => {
    if (!req.auth) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
    }

    const url = new URL(req.url || '/', 'http://localhost');
    const pageNum = optionalInt(url.searchParams.get('pageNum'), 'pageNum', { min: 1, max: 10000 }) ?? 1;
    const pageSize = optionalInt(url.searchParams.get('pageSize'), 'pageSize', { min: 1, max: 100 }) ?? 10;
    const equipName = optionalString(url.searchParams.get('equipName'), 'equipName', { max: 200 });
    const deviceAddress = optionalString(url.searchParams.get('deviceAddress'), 'deviceAddress', { max: 20 });
    const deviceOnline = optionalInt(url.searchParams.get('deviceOnline'), 'deviceOnline', { min: 0 });
    const all = ['1', 'true', 'yes'].includes(String(url.searchParams.get('all') || '').toLowerCase());

    const token = await getVendorAccessToken(req.auth);
    const listDevices = all ? listAllVendorDevices : listVendorDevices;
    const result = await listDevices({
      token,
      pageNum,
      pageSize,
      equipName,
      deviceAddress,
      deviceOnline,
    });

    let devices = result.records;
    if (config.auth.vendor.realtimeEnabled && devices.length) {
      try {
        const live = await fetchVendorRealtimeDevices({ token, devices });
        devices = mergeRealtimeDevices(devices, live);
      } catch (error) {
        // The REST summary remains usable when the realtime socket is briefly
        // unavailable. Log only the stable code, never vendor details or tokens.
        console.warn('[vendor] realtime telemetry unavailable:', error.code || 'VENDOR_REALTIME_UNAVAILABLE');
      }
    }

    const vendorAccountId = vendorAccountIdForSession(req.auth);
    if (vendorAccountId && devices.length) {
      try {
        const latest = await loadLatestVendorTelemetrySnapshots({
          vendorAccountId,
          deviceIds: devices.map((device) => String(device.id)),
        });
        devices = mergeLatestVendorTelemetry(devices, latest);
      } catch (error) {
        console.warn('[vendor] latest saved telemetry unavailable:', error.code || 'TELEMETRY_FALLBACK_UNAVAILABLE');
      }
    }

    const scopedDevices = devices.map((device) => scopedDeviceForRole(device, req.auth.user.role));
    sendOk(res, { devices: scopedDevices }, result.pagination);
  });

  // Explicit, auditable synchronization. It mirrors vendor records only and
  // never links a vendor device to a client or machine automatically.
  router.post('/api/v1/vendor-devices/sync', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);
    const pageNum = optionalInt(body.pageNum, 'pageNum', { min: 1, max: 10000 }) ?? 1;
    const pageSize = optionalInt(body.pageSize, 'pageSize', { min: 1, max: 100 }) ?? 100;

    const token = req.auth
      ? await getVendorAccessToken(req.auth)
      : (await loadCollectorCredentials())?.accessToken;
    if (!token) {
      throw new AppError('VENDOR_SESSION_EXPIRED', 'No collector credential is available for synchronization', {
        status: 401,
      });
    }
    const result = await listVendorDevices({ token, pageNum, pageSize });
    const devices = await upsertVendorDevices(result.records);
    sendOk(res, { synced: devices.length, devices }, result.pagination);
  });
}
