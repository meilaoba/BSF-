import { AppError } from '../lib/errors.js';
import { readJsonBody, sendOk } from '../lib/http.js';
import { optionalInt, optionalString } from '../lib/validate.js';
import { getVendorAccessToken } from '../middleware/session.js';
import { requireApiKey } from '../middleware/auth.js';
import { listVendorDevices } from '../providers/vendor-devices.js';
import { upsertVendorDevices } from '../services/device-data.js';

export function registerVendorDeviceRoutes(router) {
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

    const token = await getVendorAccessToken(req.auth);
    const result = await listVendorDevices({
      token,
      pageNum,
      pageSize,
      equipName,
      deviceAddress,
      deviceOnline,
    });

    sendOk(res, { devices: result.records }, result.pagination);
  });

  // Explicit, auditable synchronization. It mirrors vendor records only and
  // never links a vendor device to a client or machine automatically.
  router.post('/api/v1/vendor-devices/sync', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);
    const pageNum = optionalInt(body.pageNum, 'pageNum', { min: 1, max: 10000 }) ?? 1;
    const pageSize = optionalInt(body.pageSize, 'pageSize', { min: 1, max: 100 }) ?? 100;

    const token = await getVendorAccessToken(req.auth);
    const result = await listVendorDevices({ token, pageNum, pageSize });
    const devices = await upsertVendorDevices(result.records);
    sendOk(res, { synced: devices.length, devices }, result.pagination);
  });
}
