import { config } from '../config.js';
import { audit, query, withTransaction } from '../db.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { clientIp, readJsonBody, sendOk } from '../lib/http.js';
import { optionalInt, optionalString, optionalUuid } from '../lib/validate.js';
import { getVendorAccessToken } from '../middleware/session.js';
import { requireApiKey } from '../middleware/auth.js';
import {
  listAllVendorDevices,
  listAllVendorDevicesCached,
  listVendorDevices,
} from '../providers/vendor-devices.js';
import { fetchVendorRealtimeDevices, mergeRealtimeDevices } from '../providers/vendor-realtime.js';
import { aggregateHistoryRows, fetchVendorHistory, validateHistoryRange } from '../providers/vendor-history.js';
import {
  loadVendorDeviceSyncTimes,
  upsertVendorDevices,
} from '../services/device-data.js';
import {
  loadLatestVendorTelemetrySnapshots,
  vendorAccountIdForSession,
} from '../services/vendor-analytics.js';
import {
  loadCollectorCredentials,
  refreshCollectorCredentials,
} from '../services/vendor-collector.js';

export function mergeLatestVendorTelemetry(devices, latestByDevice) {
  return devices.map((device) => {
    const latest = latestByDevice.get(String(device.id));
    if (!latest) return device;
    return {
      ...device,
      telemetry: { ...(latest.telemetry || {}), ...(device.telemetry || {}) },
      input: { ...(latest.input || {}), ...(device.input || {}) },
      output: { ...(latest.output || {}), ...(device.output || {}) },
      onlineCode: latest.normalized?.onlineCode ?? device.onlineCode,
      recordedAt: device.recordedAt || latest.recordedAt || latest.capturedAt,
      latestTelemetryAt: latest.capturedAt,
    };
  });
}

export function mergeVendorDeviceSyncTimes(devices, syncTimes) {
  return devices.map((device) => {
    const lastSyncedAt = syncTimes.get(String(device.id));
    return lastSyncedAt ? { ...device, lastSyncedAt } : device;
  });
}

export async function listVendorDevicesWithCollectorRefresh({
  collector,
  pageNum,
  pageSize,
  listDevices = listVendorDevices,
  refreshCollector = refreshCollectorCredentials,
} = {}) {
  try {
    return await listDevices({ token: collector.accessToken, pageNum, pageSize });
  } catch (error) {
    if (error?.code !== 'VENDOR_SESSION_EXPIRED' || !collector?.refreshToken) throw error;
    const token = await refreshCollector(collector, collector.accessToken);
    return listDevices({ token, pageNum, pageSize });
  }
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
          includeAllAccounts: req.auth.user.role === 'master_admin',
          deviceIds: devices.map((device) => String(device.id)),
        });
        devices = mergeLatestVendorTelemetry(devices, latest);
      } catch (error) {
        console.warn('[vendor] latest saved telemetry unavailable:', error.code || 'TELEMETRY_FALLBACK_UNAVAILABLE');
      }
    }

    if (devices.length) {
      try {
        const syncTimes = await loadVendorDeviceSyncTimes(
          devices.map((device) => String(device.id))
        );
        devices = mergeVendorDeviceSyncTimes(devices, syncTimes);
      } catch (error) {
        console.warn('[vendor] local sync time unavailable:', error.code || error.message);
      }
    }

    const scopedDevices = devices.map((device) => scopedDeviceForRole(device, req.auth.user.role));
    sendOk(res, { devices: scopedDevices }, result.pagination);
  });

  // Assigns one device from the signed-in vendor account's device pool to a
  // local Client. The vendor token is the source of truth for device access;
  // the Client row is the source of truth for local customer grouping.
  router.put('/api/v1/vendor-devices/assignment', async (req, res) => {
    if (!req.auth) throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
    const role = req.auth.user.role;
    if (!['master_admin', 'client_admin'].includes(role)) throw new ForbiddenError();

    const body = await readJsonBody(req);
    const vendorDeviceId = optionalString(body.deviceId, 'deviceId', { max: 160 });
    if (!vendorDeviceId) throw new ValidationError('`deviceId` is required');
    const clientId = body.clientId === undefined || body.clientId === null || body.clientId === ''
      ? null
      : optionalUuid(body.clientId, 'clientId');
    const actorVendorAccountId = role === 'client_admin'
      ? vendorAccountIdForSession(req.auth)
      : null;
    if (role === 'client_admin' && !actorVendorAccountId) throw new ForbiddenError();

    const token = await getVendorAccessToken(req.auth);
    const available = await listAllVendorDevicesCached({ token, pageNum: 1, pageSize: 100 });
    const vendorDevice = available.records.find((device) => String(device.id) === String(vendorDeviceId));
    if (!vendorDevice) throw new ForbiddenError('Device is not available to this vendor account');

    let client = null;
    if (clientId) {
      const result = await query('SELECT id, name, vendor_account_id FROM clients WHERE id = $1', [clientId]);
      client = result.rows[0] || null;
      if (!client) throw new NotFoundError('Client not found');
      if (role === 'client_admin' && String(client.vendor_account_id || '') !== actorVendorAccountId) {
        throw new ForbiddenError('Client is not managed by this vendor account');
      }
    }

    const machineVendorAccountId = role === 'client_admin'
      ? actorVendorAccountId
      : (client?.vendor_account_id || vendorDevice.owner?.id || null);
    const serial = vendorDevice.serialNumber || String(vendorDevice.id);
    await upsertVendorDevices([vendorDevice]);

    const machine = await withTransaction(async (clientDb) => {
      const existing = await clientDb.query(
        `SELECT *
           FROM machines
          WHERE vendor_device_id = $1 OR serial = $2
          ORDER BY (vendor_device_id = $1) DESC
          LIMIT 1
          FOR UPDATE`,
        [String(vendorDevice.id), serial]
      );
      const before = existing.rows[0] || null;
      if (before && role === 'client_admin'
        && before.vendor_account_id
        && String(before.vendor_account_id) !== actorVendorAccountId) {
        throw new ForbiddenError('Machine is managed by another vendor account');
      }

      let saved;
      if (before) {
        const updated = await clientDb.query(
          `UPDATE machines
              SET client_id = $2,
                  vendor_device_id = $3,
                  vendor_account_id = $4,
                  name = COALESCE(name, $5),
                  device_id = COALESCE(device_id, $6),
                  latitude = COALESCE(latitude, $7),
                  longitude = COALESCE(longitude, $8)
            WHERE id = $1
            RETURNING *`,
          [
            before.id,
            clientId,
            String(vendorDevice.id),
            machineVendorAccountId,
            vendorDevice.deviceName,
            vendorDevice.serialNumber,
            vendorDevice.latitude,
            vendorDevice.longitude,
          ]
        );
        saved = updated.rows[0];
      } else {
        const inserted = await clientDb.query(
          `INSERT INTO machines
             (serial, device_id, name, client_id, latitude, longitude, status, vendor_device_id, vendor_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8)
           RETURNING *`,
          [
            serial,
            vendorDevice.serialNumber,
            vendorDevice.deviceName || serial,
            clientId,
            vendorDevice.latitude,
            vendorDevice.longitude,
            String(vendorDevice.id),
            machineVendorAccountId,
          ]
        );
        saved = inserted.rows[0];
      }

      await clientDb.query(
        `UPDATE users SET client_id = $2 WHERE machine_id = $1 AND role = 'user'`,
        [saved.id, clientId]
      );
      await clientDb.query(
        `UPDATE notification_recipients SET client_id = $2 WHERE machine_id = $1`,
        [saved.id, clientId]
      );
      return saved;
    });

    await audit({
      action: 'vendor_device.client_assignment',
      actorType: 'api',
      entityType: 'vendor_device',
      entityId: String(vendorDevice.id),
      after: { machineId: machine.id, clientId, clientName: client?.name || null },
      ip: clientIp(req),
    });
    sendOk(res, machine);
  });

  // Explicit, auditable synchronization. It mirrors vendor records only and
  // never links a vendor device to a client or machine automatically.
  router.post('/api/v1/vendor-devices/sync', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);
    const pageNum = optionalInt(body.pageNum, 'pageNum', { min: 1, max: 10000 }) ?? 1;
    const pageSize = optionalInt(body.pageSize, 'pageSize', { min: 1, max: 100 }) ?? 100;

    const collector = req.auth ? null : await loadCollectorCredentials();
    if (!req.auth && !collector?.accessToken) {
      throw new AppError('VENDOR_SESSION_EXPIRED', 'No collector credential is available for synchronization', {
        status: 401,
      });
    }
    const result = collector
      ? await listVendorDevicesWithCollectorRefresh({ collector, pageNum, pageSize })
      : await listVendorDevices({
        token: await getVendorAccessToken(req.auth),
        pageNum,
        pageSize,
      });
    const devices = await upsertVendorDevices(result.records);
    sendOk(res, { synced: devices.length, devices }, result.pagination);
  });
}
