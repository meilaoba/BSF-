import { sendJson, sendOk, readJsonBody } from '../lib/http.js';
import { ValidationError } from '../lib/errors.js';
import { clampLimit, optionalString, optionalUuid } from '../lib/validate.js';
import { requireApiKey } from '../middleware/auth.js';
import {
  ingestTelemetryPayload,
  parseTelemetryTimestamp,
} from '../services/device-data.js';
import {
  loadVendorTelemetryHistory,
  resolveVendorDeviceIds,
  vendorAccountIdForSession,
} from '../services/vendor-analytics.js';

function dateFilter(value, field) {
  const text = optionalString(value, field, { max: 80 });
  if (!text) return null;
  return parseTelemetryTimestamp(text).toISOString();
}

export function registerDeviceDataRoutes(router) {
  router.get('/api/v1/device-data', async (req, res) => {
    if (!req.auth) throw new ValidationError('Authentication required');
    const url = new URL(req.url || '/', 'http://localhost');
    const machineId = optionalUuid(url.searchParams.get('machineId'), 'machineId');
    const clientId = optionalUuid(url.searchParams.get('clientId'), 'clientId');
    const from = dateFilter(url.searchParams.get('from'), 'from');
    const to = dateFilter(url.searchParams.get('to'), 'to');
    if (from && to && from > to) {
      throw new ValidationError('`from` must not be after `to`');
    }

    const role = req.auth.user.role;
    const vendorAccountId = vendorAccountIdForSession(req.auth);
    if (!vendorAccountId) throw new ValidationError('The account has no vendor scope');
    const includeAllAccounts = role === 'master_admin';
    const deviceIds = clientId || machineId
      ? await resolveVendorDeviceIds({ clientId, machineId })
      : null;
    const rows = await loadVendorTelemetryHistory({
      vendorAccountId,
      includeAllAccounts,
      deviceIds,
      from,
      to,
      limit: clampLimit(url.searchParams.get('limit'), { def: 200, max: 1000 }),
    });
    sendOk(res, rows);
  });

  router.post('/api/v1/device-data/ingest', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);
    const saved = await ingestTelemetryPayload(body);
    sendJson(res, 201, {
      ok: true,
      data: {
        count: saved.length,
        records: saved,
        source: 'legacy-machine-telemetry',
      },
    });
  });
}
