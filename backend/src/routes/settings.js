import { audit, query, withTransaction } from '../db.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { clientIp, readJsonBody, sendOk } from '../lib/http.js';
import {
  optionalBool,
  optionalNumber,
  optionalString,
  optionalUuid,
  requireEnum,
} from '../lib/validate.js';
import { getVendorAccessToken } from '../middleware/session.js';
import { listAllVendorDevicesCached } from '../providers/vendor-devices.js';
import { upsertVendorDevices } from '../services/device-data.js';

export function normalizeGhgConfiguration(body = {}) {
  const machineId = optionalUuid(body.machineId, 'machineId');
  const vendorDeviceId = optionalString(body.vendorDeviceId ?? body.deviceId, 'vendorDeviceId', { max: 160 });
  if (!machineId && !vendorDeviceId) {
    throw new ValidationError('A machine or vendor device is required');
  }
  const region = requireEnum(body.region, 'region', ['hk', 'non-hk']);
  const solar = optionalBool(body.solar, 'solar');
  if (solar === null) throw new ValidationError('`solar` is required', { field: 'solar' });
  const monthlyDistanceKm = optionalNumber(body.monthlyDistanceKm, 'monthlyDistanceKm');
  if (monthlyDistanceKm === null || monthlyDistanceKm < 0) {
    throw new ValidationError('`monthlyDistanceKm` must be zero or greater', {
      field: 'monthlyDistanceKm',
    });
  }
  return { machineId, vendorDeviceId, region, solar, monthlyDistanceKm };
}

export function registerSettingsRoutes(router) {
  router.put('/api/v1/settings/ghg', async (req, res) => {
    if (req.auth?.user?.role !== 'master_admin') throw new ForbiddenError();
    const input = normalizeGhgConfiguration(await readJsonBody(req));

    let before = null;
    if (input.machineId) {
      const existing = await query('SELECT * FROM machines WHERE id = $1', [input.machineId]);
      if (!existing.rows[0]) throw new NotFoundError('Machine not found');
      before = existing.rows[0];
    } else {
      const existing = await query(
        'SELECT * FROM machines WHERE vendor_device_id = $1 LIMIT 1',
        [input.vendorDeviceId]
      );
      before = existing.rows[0] || null;
      if (!before) {
        const token = await getVendorAccessToken(req.auth);
        const available = await listAllVendorDevicesCached({ token, pageNum: 1, pageSize: 100 });
        const vendorDevice = available.records.find((device) => String(device.id) === input.vendorDeviceId);
        if (!vendorDevice) throw new NotFoundError('Vendor device not found');
        await upsertVendorDevices([vendorDevice]);
        const serial = vendorDevice.serialNumber || String(vendorDevice.id);
        const inserted = await query(
          `INSERT INTO machines
             (serial, device_id, name, region, status, vendor_device_id, vendor_account_id)
           VALUES ($1,$2,$3,$4,'active',$5,$6)
           RETURNING *`,
          [
            serial,
            vendorDevice.serialNumber,
            vendorDevice.deviceName || serial,
            input.region,
            String(vendorDevice.id),
            vendorDevice.owner?.id || null,
          ]
        );
        before = inserted.rows[0];
      }
    }

    const updated = await withTransaction(async (db) => {
      const result = await db.query(
        `UPDATE machines
            SET region = $2,
                metadata = jsonb_set(
                  COALESCE(metadata, '{}'::jsonb),
                  '{ghgFormula}',
                  COALESCE(metadata->'ghgFormula', '{}'::jsonb) || $3::jsonb,
                  true
                )
          WHERE id = $1
          RETURNING id, serial, vendor_device_id, region, metadata, updated_at`,
        [
          before.id,
          input.region,
          JSON.stringify({
            solar: input.solar,
            monthlyDistanceKm: input.monthlyDistanceKm,
          }),
        ]
      );
      return result.rows[0];
    });

    await audit({
      action: 'machine.ghg_configuration.update',
      actorType: 'user',
      actorId: req.auth.user.id,
      actorLabel: req.auth.user.userName,
      entityType: 'machine',
      entityId: before.id,
      before: {
        region: before.region,
        ghgFormula: before.metadata?.ghgFormula || null,
      },
      after: {
        region: updated.region,
        ghgFormula: updated.metadata?.ghgFormula || null,
      },
      ip: clientIp(req),
    });
    sendOk(res, updated);
  });
}
