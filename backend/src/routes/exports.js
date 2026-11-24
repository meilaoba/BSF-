import { AppError, ValidationError } from '../lib/errors.js';
import { optionalString } from '../lib/validate.js';
import { getVendorAccessToken } from '../middleware/session.js';
import { listAllVendorDevicesCached } from '../providers/vendor-devices.js';
import { fetchVendorExport } from '../providers/vendor-export.js';
import { resolveVendorDeviceIds } from '../services/vendor-analytics.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nextDate(value) {
  if (!validDate(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function matchingDevice(records, selector, aliases = []) {
  const values = new Set(
    [selector, ...(Array.isArray(aliases) ? aliases : [])]
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map(String)
  );
  if (!values.size) return null;
  return records.find((device) => (
    values.has(String(device.id || ''))
    || values.has(String(device.serialNumber || ''))
    || values.has(String(device.deviceName || ''))
  )) || null;
}

async function authorizedDevice(records, selector) {
  const direct = matchingDevice(records, selector);
  if (direct || !selector) return direct;

  // User sessions are scoped by the local Machine UUID. Resolve that mapping,
  // then require the resulting vendor device to still be present in the
  // signed-in vendor token's authorized device list.
  const localVendorIds = await resolveVendorDeviceIds({ machineId: selector });
  return matchingDevice(records, selector, localVendorIds);
}

function sendWorkbook(res, file) {
  res.writeHead(200, {
    'Content-Type': file.contentType,
    'Content-Length': file.bytes.length,
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(file.bytes);
}

async function authorizedDevices(req) {
  const token = await getVendorAccessToken(req.auth);
  const result = await listAllVendorDevicesCached({ token, pageNum: 1, pageSize: 100 });
  return { token, records: result.records };
}

export function registerExportRoutes(router) {
  router.get('/api/v1/exports/device-data', async (req, res) => {
    if (!req.auth) throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
    const url = new URL(req.url || '/', 'http://localhost');
    const machineId = optionalString(url.searchParams.get('machineId'), 'machineId', { max: 160 });
    const startDate = optionalString(url.searchParams.get('startDate'), 'startDate', { max: 10 });
    const endDate = optionalString(url.searchParams.get('endDate'), 'endDate', { max: 10 });
    if (!machineId) throw new ValidationError('`machineId` is required');
    if (startDate && !validDate(startDate)) throw new ValidationError('`startDate` must be YYYY-MM-DD');
    if (endDate && !validDate(endDate)) throw new ValidationError('`endDate` must be YYYY-MM-DD');
    if ((startDate && !endDate) || (!startDate && endDate)) {
      throw new ValidationError('`startDate` and `endDate` must be provided together');
    }
    if (startDate > endDate) throw new ValidationError('`startDate` cannot be after `endDate`');

    const { token, records } = await authorizedDevices(req);
    const device = await authorizedDevice(records, machineId);
    if (!device) throw new AppError('FORBIDDEN', 'Device is not available to this account', { status: 403 });
    if (!device.deviceName) throw new ValidationError('Vendor deviceName is unavailable');

    const file = await fetchVendorExport({
      kind: 'device-data',
      token,
      deviceName: device.deviceName,
      deviceSerialNum: device.serialNumber || '',
      startTime: startDate || '',
      endTime: endDate ? nextDate(endDate) : '',
    });
    sendWorkbook(res, file);
  });

  router.get('/api/v1/exports/alarms', async (req, res) => {
    if (!req.auth) throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
    const url = new URL(req.url || '/', 'http://localhost');
    const machineId = optionalString(url.searchParams.get('machineId'), 'machineId', { max: 160 });
    const { token, records } = await authorizedDevices(req);
    const device = machineId ? await authorizedDevice(records, machineId) : null;
    if (machineId && !device) {
      throw new AppError('FORBIDDEN', 'Device is not available to this account', { status: 403 });
    }
    const file = await fetchVendorExport({
      kind: 'alarms',
      token,
      deviceName: device?.deviceName || '',
    });
    sendWorkbook(res, file);
  });
}
