import { AppError, NotFoundError, ValidationError } from '../lib/errors.js';
import { sendOk } from '../lib/http.js';
import { optionalInt, optionalString } from '../lib/validate.js';
import { getVendorAccessToken } from '../middleware/session.js';
import { listAllVendorDevicesCached } from '../providers/vendor-devices.js';
import { fetchVendorDailyStats } from '../providers/vendor-daily-stats.js';
import { fetchVendorTemplates } from '../providers/vendor-templates.js';
import { validateHistoryRange } from '../providers/vendor-history.js';

function requireSession(req) {
  if (!req.auth) throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
}

export function registerVendorInformationRoutes(router) {
  router.get('/api/v1/vendor-templates', async (req, res) => {
    requireSession(req);
    const url = new URL(req.url || '/', 'http://localhost');
    const pageNum = optionalInt(url.searchParams.get('pageNum'), 'pageNum', { min: 1, max: 10000 }) ?? 1;
    const pageSize = optionalInt(url.searchParams.get('pageSize'), 'pageSize', { min: 1, max: 100 }) ?? 20;
    const token = await getVendorAccessToken(req.auth);
    const result = await fetchVendorTemplates({ token, pageNum, pageSize });
    sendOk(res, { templates: result.records, source: 'vendor-template-list' }, result.pagination);
  });

  router.get('/api/v1/vendor-daily-stats', async (req, res) => {
    requireSession(req);
    const url = new URL(req.url || '/', 'http://localhost');
    const deviceId = optionalString(url.searchParams.get('deviceId'), 'deviceId', { max: 160 });
    if (!deviceId) throw new ValidationError('`deviceId` is required');
    const start = optionalString(url.searchParams.get('start'), 'start', { max: 20 });
    const end = optionalString(url.searchParams.get('end'), 'end', { max: 20 });
    if ((start && !end) || (!start && end)) {
      throw new ValidationError('`start` and `end` must be supplied together');
    }
    if (start) {
      const range = validateHistoryRange(start, end);
      if (range.span > 59) throw new ValidationError('Daily stats range cannot exceed 60 days');
    }
    const pageNum = optionalInt(url.searchParams.get('pageNum'), 'pageNum', { min: 1, max: 10000 }) ?? 1;
    const pageSize = optionalInt(url.searchParams.get('pageSize'), 'pageSize', { min: 1, max: 100 }) ?? 20;

    const token = await getVendorAccessToken(req.auth);
    const vendorDevices = await listAllVendorDevicesCached({ token, pageNum: 1, pageSize: 100 });
    const device = vendorDevices.records.find((record) => (
      String(record.id) === String(deviceId)
      || String(record.serialNumber) === String(deviceId)
    ));
    if (!device) throw new NotFoundError('Vendor device not found');
    if (!device.deviceName) throw new NotFoundError('Vendor device has no device name');

    const result = await fetchVendorDailyStats({
      token,
      deviceName: device.deviceName,
      startTime: start || '',
      endTime: end || '',
      pageNum,
      pageSize,
    });
    sendOk(res, {
      deviceId: String(device.id),
      serialNumber: device.serialNumber,
      deviceName: device.deviceName,
      records: result.records,
      source: 'vendor-daily-device-list',
    }, result.pagination);
  });
}
