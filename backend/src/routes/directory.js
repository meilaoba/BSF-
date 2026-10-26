import { query, withTransaction, audit } from '../db.js';
import { sendJson, sendOk, readJsonBody, clientIp } from '../lib/http.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import {
  clampLimit,
  clampOffset,
  optionalBool,
  optionalEmail,
  optionalInt,
  optionalNumber,
  optionalPhone,
  optionalString,
  optionalUuid,
  requireEmail,
  requireEnum,
  requirePhone,
  requireString,
} from '../lib/validate.js';
import { requireApiKey } from '../middleware/auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function q(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

function lastPathSegment(req, prefix) {
  const path = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '');
  const rest = path.slice(prefix.length);
  return rest.split('/').filter(Boolean)[0] ?? null;
}

/**
 * NOTE ON AUTHORISATION
 * ---------------------
 * These handlers accept explicit `clientId` / `machineId` filters so the data
 * scoping rules (master admin = everything, client admin = one client,
 * user = one machine) can be enforced. Until the session layer lands, the
 * filter is supplied by the caller. The session layer MUST overwrite it from
 * the authenticated principal and never trust it from the browser.
 */
function scopeFilter(searchParams, alias, params, { supportsMachine = true } = {}) {
  const clientId = optionalUuid(searchParams.get('clientId'), 'clientId');
  const machineId = optionalUuid(searchParams.get('machineId'), 'machineId');
  const clauses = [];

  if (clientId) {
    params.push(clientId);
    clauses.push(`${alias}.client_id = $${params.length}`);
  }
  if (machineId && supportsMachine) {
    params.push(machineId);
    clauses.push(`${alias}.machine_id = $${params.length}`);
  }
  return clauses;
}

export function registerDirectoryRoutes(router) {
  // =====================================================================
  // Clients
  // =====================================================================
  router.get('/api/v1/clients', async (req, res) => {
    const search = q(req);
    const limit = clampLimit(search.get('limit'), { def: 100, max: 500 });
    const offset = clampOffset(search.get('offset'));

    const params = [];
    const clauses = [];
    const status = optionalString(search.get('status'), 'status', { max: 20 });
    if (status) {
      params.push(requireEnum(status, 'status', ['active', 'inactive', 'archived']));
      clauses.push(`status = $${params.length}`);
    }
    const clientId = optionalUuid(search.get('clientId'), 'clientId');
    if (clientId) {
      params.push(clientId);
      clauses.push(`id = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT c.*,
              (SELECT count(*)::int FROM machines m WHERE m.client_id = c.id) AS machine_count,
              (SELECT count(*)::int FROM users u WHERE u.client_id = c.id)  AS user_count
         FROM clients c
         ${where}
        ORDER BY c.name
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    sendOk(res, rows, { limit, offset });
  });

  router.post('/api/v1/clients', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    const { rows } = await query(
      `INSERT INTO clients (name, code, contact_email, contact_phone, address, region, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        requireString(body.name, 'name', { max: 200 }),
        optionalString(body.code, 'code', { max: 60 }),
        optionalEmail(body.contactEmail, 'contactEmail'),
        optionalPhone(body.contactPhone, 'contactPhone'),
        optionalString(body.address, 'address', { max: 500 }),
        optionalString(body.region, 'region', { max: 80 }),
        JSON.stringify(body.metadata ?? {}),
        optionalString(body.vendorDeviceId, 'vendorDeviceId', { max: 160 }),
      ]
    );

    await audit({
      action: 'client.create',
      actorType: 'api',
      entityType: 'client',
      entityId: rows[0].id,
      after: { name: rows[0].name },
      ip: clientIp(req),
    });
    sendJson(res, 201, { ok: true, data: rows[0] });
  });

  router.put('/api/v1/clients', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);
    const clientId = optionalUuid(body.id, 'id');
    if (!clientId) throw new ValidationError('`id` is required');

    const before = await query('SELECT * FROM clients WHERE id = $1', [clientId]);
    if (!before.rows[0]) throw new NotFoundError('Client not found');

    const { rows } = await query(
      `UPDATE clients
          SET name = COALESCE($2, name),
              code = COALESCE($3, code),
              contact_email = COALESCE($4, contact_email),
              contact_phone = COALESCE($5, contact_phone),
              address = COALESCE($6, address),
              region = COALESCE($7, region),
              status = COALESCE($8, status)
        WHERE id = $1
        RETURNING *`,
      [
        clientId,
        optionalString(body.name, 'name', { max: 200 }),
        optionalString(body.code, 'code', { max: 60 }),
        optionalEmail(body.contactEmail, 'contactEmail'),
        optionalPhone(body.contactPhone, 'contactPhone'),
        optionalString(body.address, 'address', { max: 500 }),
        optionalString(body.region, 'region', { max: 80 }),
        body.status ? requireEnum(body.status, 'status', ['active', 'inactive', 'archived']) : null,
      ]
    );

    await audit({
      action: 'client.update',
      actorType: 'api',
      entityType: 'client',
      entityId: clientId,
      before: { name: before.rows[0].name, status: before.rows[0].status },
      after: { name: rows[0].name, status: rows[0].status },
      ip: clientIp(req),
    });
    sendOk(res, rows[0]);
  });

  router.delete('/api/v1/clients', async (req, res) => {
    requireApiKey(req);
    const clientId = optionalUuid(q(req).get('id'), 'id');
    if (!clientId) throw new ValidationError('`id` query parameter is required');

    const { rows } = await query(
      `UPDATE clients SET status = 'archived' WHERE id = $1 RETURNING id, name, status`,
      [clientId]
    );
    if (!rows[0]) throw new NotFoundError('Client not found');

    await audit({
      action: 'client.archive',
      actorType: 'api',
      entityType: 'client',
      entityId: clientId,
      ip: clientIp(req),
    });
    sendOk(res, rows[0]);
  });

  // =====================================================================
  // Machines
  // =====================================================================
  router.get('/api/v1/machines', async (req, res) => {
    const search = q(req);
    const limit = clampLimit(search.get('limit'), { def: 200, max: 1000 });
    const offset = clampOffset(search.get('offset'));

    const params = [];
    const clauses = [];

    const clientId = optionalUuid(search.get('clientId'), 'clientId');
    if (clientId) {
      params.push(clientId);
      clauses.push(`m.client_id = $${params.length}`);
    }
    const machineId = optionalUuid(search.get('machineId'), 'machineId');
    if (machineId) {
      params.push(machineId);
      clauses.push(`m.id = $${params.length}`);
    }
    const status = optionalString(search.get('status'), 'status', { max: 20 });
    if (status) {
      params.push(requireEnum(status, 'status', ['active', 'inactive', 'maintenance', 'retired']));
      clauses.push(`m.status = $${params.length}`);
    }
    const searchTerm = optionalString(search.get('search'), 'search', { max: 100 });
    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      clauses.push(`(m.serial ILIKE $${params.length} OR m.device_id ILIKE $${params.length} OR m.name ILIKE $${params.length} OR m.location ILIKE $${params.length} OR vd.device_name ILIKE $${params.length})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT m.*, c.name AS client_name,
              vd.device_name AS vendor_device_name,
              vd.online_code AS vendor_online_code,
              vd.last_synced_at AS vendor_last_synced_at,
              (SELECT count(*)::int FROM users u WHERE u.machine_id = m.id) AS user_count
         FROM machines m
         LEFT JOIN clients c ON c.id = m.client_id
         LEFT JOIN vendor_devices vd ON vd.vendor_device_id = m.vendor_device_id
         ${where}
        ORDER BY c.name NULLS LAST, m.serial
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    sendOk(res, rows, { limit, offset });
  });

  router.post('/api/v1/machines', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    const { rows } = await query(
      `INSERT INTO machines (serial, device_id, name, client_id, location, latitude, longitude, region, status, metadata, vendor_device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9,'active'), $10, $11)
       RETURNING *`,
      [
        requireString(body.serial, 'serial', { max: 64 }),
        optionalString(body.deviceId, 'deviceId', { max: 64 }),
        optionalString(body.name, 'name', { max: 200 }),
        optionalUuid(body.clientId, 'clientId'),
        optionalString(body.location, 'location', { max: 300 }),
        optionalNumber(body.latitude, 'latitude'),
        optionalNumber(body.longitude, 'longitude'),
        optionalString(body.region, 'region', { max: 80 }),
        body.status ? requireEnum(body.status, 'status', ['active', 'inactive', 'maintenance', 'retired']) : null,
        JSON.stringify(body.metadata ?? {}),
        optionalString(body.vendorDeviceId, 'vendorDeviceId', { max: 160 }),
      ]
    );

    await audit({
      action: 'machine.create',
      actorType: 'api',
      entityType: 'machine',
      entityId: rows[0].id,
      after: { serial: rows[0].serial },
      ip: clientIp(req),
    });
    sendJson(res, 201, { ok: true, data: rows[0] });
  });

  router.put('/api/v1/machines', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);
    const machineId = optionalUuid(body.id, 'id');
    if (!machineId) throw new ValidationError('`id` is required');

    const before = await query('SELECT * FROM machines WHERE id = $1', [machineId]);
    if (!before.rows[0]) throw new NotFoundError('Machine not found');

    // Re-linking a machine to a client automatically re-scopes its users,
    // so the newest linkage always wins.
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE machines
            SET serial = COALESCE($2, serial),
                device_id = COALESCE($3, device_id),
                name = COALESCE($4, name),
                client_id = $5,
                location = COALESCE($6, location),
                latitude = COALESCE($7, latitude),
                longitude = COALESCE($8, longitude),
                region = COALESCE($9, region),
                status = COALESCE($10, status),
                vendor_device_id = COALESCE($11, vendor_device_id)
          WHERE id = $1
          RETURNING *`,
        [
          machineId,
          optionalString(body.serial, 'serial', { max: 64 }),
          optionalString(body.deviceId, 'deviceId', { max: 64 }),
          optionalString(body.name, 'name', { max: 200 }),
          body.clientId === undefined ? before.rows[0].client_id : optionalUuid(body.clientId, 'clientId'),
          optionalString(body.location, 'location', { max: 300 }),
          optionalNumber(body.latitude, 'latitude'),
          optionalNumber(body.longitude, 'longitude'),
          optionalString(body.region, 'region', { max: 80 }),
          body.status ? requireEnum(body.status, 'status', ['active', 'inactive', 'maintenance', 'retired']) : null,
          optionalString(body.vendorDeviceId, 'vendorDeviceId', { max: 160 }),
        ]
      );

      // Keep the client linkage of scoped users consistent with the machine.
      await client.query(
        `UPDATE users SET client_id = $2 WHERE machine_id = $1 AND role = 'user'`,
        [machineId, rows[0].client_id]
      );

      // Rebind recipients that follow the machine to the new client scope.
      await client.query(
        `UPDATE notification_recipients SET client_id = $2 WHERE machine_id = $1`,
        [machineId, rows[0].client_id]
      );

      return rows[0];
    });

    await audit({
      action: 'machine.update',
      actorType: 'api',
      entityType: 'machine',
      entityId: machineId,
      before: before.rows[0],
      after: result,
      ip: clientIp(req),
    });
    sendOk(res, result);
  });

  router.delete('/api/v1/machines', async (req, res) => {
    requireApiKey(req);
    const search = q(req);
    const machineId = optionalUuid(search.get('id'), 'id');
    if (!machineId) throw new ValidationError('`id` query parameter is required');

    const hard = search.get('hard') === 'true';
    const before = await query('SELECT * FROM machines WHERE id = $1', [machineId]);
    if (!before.rows[0]) throw new NotFoundError('Machine not found');

    if (hard) {
      // Only allow a real delete when nothing references the machine.
      const refs = await query(
        `SELECT
           (SELECT count(*)::int FROM users WHERE machine_id = $1)               AS users,
           (SELECT count(*)::int FROM notification_jobs WHERE machine_id = $1)   AS jobs`,
        [machineId]
      );
      const { users, jobs } = refs.rows[0];
      if (users > 0 || jobs > 0) {
        throw new ValidationError(
          'Machine is referenced by users or notification history. Deactivate it instead.',
          { users, jobs }
        );
      }
      await query('DELETE FROM machines WHERE id = $1', [machineId]);
      await audit({
        action: 'machine.delete',
        actorType: 'api',
        entityType: 'machine',
        entityId: machineId,
        before: before.rows[0],
        ip: clientIp(req),
      });
      return sendOk(res, { id: machineId, deleted: true });
    }

    // Default: retire. Preserves history so reports stay reproducible.
    const { rows } = await query(
      `UPDATE machines SET status = 'retired' WHERE id = $1 RETURNING id, serial, status`,
      [machineId]
    );
    await audit({
      action: 'machine.retire',
      actorType: 'api',
      entityType: 'machine',
      entityId: machineId,
      ip: clientIp(req),
    });
    sendOk(res, rows[0]);
  });

  // =====================================================================
  // Users
  // =====================================================================
  router.get('/api/v1/users', async (req, res) => {
    const search = q(req);
    const limit = clampLimit(search.get('limit'), { def: 200, max: 500 });
    const offset = clampOffset(search.get('offset'));

    const params = [];
    const clauses = [];
    const role = optionalString(search.get('role'), 'role', { max: 30 });
    if (role) {
      params.push(requireEnum(role, 'role', ['master_admin', 'client_admin', 'user']));
      clauses.push(`u.role = $${params.length}`);
    }
    clauses.push(...scopeFilter(search, 'u', params));

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT u.id, u.email, u.phone, u.full_name, u.role, u.status,
              u.client_id, u.machine_id, u.last_login_at, u.created_at, u.updated_at,
              c.name AS client_name, m.serial AS machine_serial, m.name AS machine_name
         FROM users u
         LEFT JOIN clients c ON c.id = u.client_id
         LEFT JOIN machines m ON m.id = u.machine_id
         ${where}
        ORDER BY u.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    sendOk(res, rows, { limit, offset });
  });

  router.post('/api/v1/users', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    const role = requireEnum(body.role ?? 'user', 'role', ['master_admin', 'client_admin', 'user']);
    let clientId = optionalUuid(body.clientId, 'clientId');
    const machineId = optionalUuid(body.machineId, 'machineId');

    // A `user` is bound to exactly one machine and inherits that machine's client.
    if (role === 'user' && !machineId) {
      throw new ValidationError('A `user` account must be linked to a machine.', { field: 'machineId' });
    }
    if (machineId) {
      const machine = await query('SELECT id, client_id FROM machines WHERE id = $1', [machineId]);
      if (!machine.rows[0]) throw new NotFoundError('Linked machine not found');
      if (role === 'user') clientId = machine.rows[0].client_id;
    }

    const email = optionalEmail(body.email, 'email');
    const phone = optionalPhone(body.phone, 'phone');
    if (!email && !phone) {
      throw new ValidationError('Supply at least an `email` or a `phone` number.');
    }

    const { rows } = await query(
      `INSERT INTO users (email, phone, full_name, role, client_id, machine_id, status, metadata)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7,'invited'), $8)
       RETURNING id, email, phone, full_name, role, status, client_id, machine_id, created_at`,
      [
        email,
        phone,
        optionalString(body.fullName, 'fullName', { max: 200 }),
        role,
        clientId,
        machineId,
        body.status ? requireEnum(body.status, 'status', ['active', 'invited', 'disabled']) : null,
        JSON.stringify(body.metadata ?? {}),
      ]
    );

    await audit({
      action: 'user.create',
      actorType: 'api',
      entityType: 'user',
      entityId: rows[0].id,
      after: { role, email, machineId },
      ip: clientIp(req),
    });
    sendJson(res, 201, { ok: true, data: rows[0] });
  });

  router.put('/api/v1/users', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);
    const userId = optionalUuid(body.id, 'id');
    if (!userId) throw new ValidationError('`id` is required');

    const before = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!before.rows[0]) throw new NotFoundError('User not found');

    const role = body.role
      ? requireEnum(body.role, 'role', ['master_admin', 'client_admin', 'user'])
      : before.rows[0].role;

    let machineId = body.machineId === undefined
      ? before.rows[0].machine_id
      : optionalUuid(body.machineId, 'machineId');

    let clientId = body.clientId === undefined
      ? before.rows[0].client_id
      : optionalUuid(body.clientId, 'clientId');

    if (role === 'user') {
      if (!machineId) throw new ValidationError('A `user` account must stay linked to a machine.');
      const machine = await query('SELECT client_id FROM machines WHERE id = $1', [machineId]);
      if (!machine.rows[0]) throw new NotFoundError('Linked machine not found');
      clientId = machine.rows[0].client_id;
    } else {
      machineId = null;
    }

    const { rows } = await query(
      `UPDATE users
          SET email = COALESCE($2, email),
              phone = COALESCE($3, phone),
              full_name = COALESCE($4, full_name),
              role = $5,
              client_id = $6,
              machine_id = $7,
              status = COALESCE($8, status)
        WHERE id = $1
        RETURNING id, email, phone, full_name, role, status, client_id, machine_id, updated_at`,
      [
        userId,
        optionalEmail(body.email, 'email'),
        optionalPhone(body.phone, 'phone'),
        optionalString(body.fullName, 'fullName', { max: 200 }),
        role,
        clientId,
        machineId,
        body.status ? requireEnum(body.status, 'status', ['active', 'invited', 'disabled']) : null,
      ]
    );

    await audit({
      action: 'user.update',
      actorType: 'api',
      entityType: 'user',
      entityId: userId,
      before: { role: before.rows[0].role, machineId: before.rows[0].machine_id },
      after: { role, machineId },
      ip: clientIp(req),
    });
    sendOk(res, rows[0]);
  });

  router.delete('/api/v1/users', async (req, res) => {
    requireApiKey(req);
    const userId = optionalUuid(q(req).get('id'), 'id');
    if (!userId) throw new ValidationError('`id` query parameter is required');

    const { rows } = await query(
      `UPDATE users SET status = 'disabled' WHERE id = $1
       RETURNING id, email, phone, role, status`,
      [userId]
    );
    if (!rows[0]) throw new NotFoundError('User not found');

    await audit({
      action: 'user.disable',
      actorType: 'api',
      entityType: 'user',
      entityId: userId,
      ip: clientIp(req),
    });
    sendOk(res, rows[0]);
  });

  // =====================================================================
  // Notification recipients
  // =====================================================================
  router.get('/api/v1/notification-recipients', async (req, res) => {
    const search = q(req);
    const params = [];
    const clauses = [];
    clauses.push(...scopeFilter(search, 'r', params, { supportsMachine: false }));

    const machineId = optionalUuid(search.get('machineId'), 'machineId');
    if (machineId) {
      params.push(machineId);
      clauses.push(`r.machine_id = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT r.*, c.name AS client_name, m.serial AS machine_serial
         FROM notification_recipients r
         LEFT JOIN clients c ON c.id = r.client_id
         LEFT JOIN machines m ON m.id = r.machine_id
         ${where}
        ORDER BY r.created_at DESC`,
      params
    );
    sendOk(res, rows);
  });

  router.post('/api/v1/notification-recipients', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    const channel = requireEnum(body.channel, 'channel', ['email', 'whatsapp']);
    const address = channel === 'email'
      ? requireEmail(body.address, 'address')
      : requirePhone(body.address, 'address');

    const { rows } = await query(
      `INSERT INTO notification_recipients (client_id, machine_id, user_id, channel, address, name, verified, enabled)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7,false), COALESCE($8,true))
       RETURNING *`,
      [
        optionalUuid(body.clientId, 'clientId'),
        optionalUuid(body.machineId, 'machineId'),
        optionalUuid(body.userId, 'userId'),
        channel,
        address,
        optionalString(body.name, 'name', { max: 200 }),
        optionalBool(body.verified, 'verified'),
        optionalBool(body.enabled, 'enabled'),
      ]
    );

    await audit({
      action: 'recipient.create',
      actorType: 'api',
      entityType: 'notification_recipient',
      entityId: rows[0].id,
      after: { channel },
      ip: clientIp(req),
    });
    sendJson(res, 201, { ok: true, data: rows[0] });
  });

  router.delete('/api/v1/notification-recipients', async (req, res) => {
    requireApiKey(req);
    const id = optionalUuid(q(req).get('id'), 'id');
    if (!id) throw new ValidationError('`id` query parameter is required');

    const { rows } = await query(
      'DELETE FROM notification_recipients WHERE id = $1 RETURNING id',
      [id]
    );
    if (!rows[0]) throw new NotFoundError('Recipient not found');

    await audit({
      action: 'recipient.delete',
      actorType: 'api',
      entityType: 'notification_recipient',
      entityId: id,
      ip: clientIp(req),
    });
    sendOk(res, { id, deleted: true });
  });

  // =====================================================================
  // Notification preferences
  // =====================================================================
  router.get('/api/v1/notification-preferences', async (req, res) => {
    const { rows } = await query(
      `SELECT p.*, c.name AS client_name, m.serial AS machine_serial, u.email AS user_email
         FROM notification_preferences p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN machines m ON m.id = p.machine_id
         LEFT JOIN users u ON u.id = p.user_id
        ORDER BY p.scope, p.channel`
    );
    sendOk(res, rows);
  });

  router.put('/api/v1/notification-preferences', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    const scope = requireEnum(body.scope ?? 'global', 'scope', ['global', 'client', 'machine', 'user']);
    const channel = requireEnum(body.channel, 'channel', ['email', 'whatsapp']);
    const clientId = optionalUuid(body.clientId, 'clientId');
    const machineId = optionalUuid(body.machineId, 'machineId');
    const userId = optionalUuid(body.userId, 'userId');

    // Partial unique indexes are used for each scope, so the upsert target
    // differs per scope. Resolve the existing row first, then update or insert.
    const existing = await query(
      `SELECT id FROM notification_preferences
        WHERE scope = $1 AND channel = $2
          AND client_id IS NOT DISTINCT FROM $3
          AND machine_id IS NOT DISTINCT FROM $4
          AND user_id IS NOT DISTINCT FROM $5
        LIMIT 1`,
      [scope, channel, clientId, machineId, userId]
    );

    const enabled = optionalBool(body.enabled, 'enabled');
    const minSeverity = body.minSeverity
      ? requireEnum(body.minSeverity, 'minSeverity', ['info', 'warning', 'critical'])
      : null;
    const quietStart = optionalString(body.quietHoursStart, 'quietHoursStart', { max: 8 });
    const quietEnd = optionalString(body.quietHoursEnd, 'quietHoursEnd', { max: 8 });

    const saved = existing.rows[0]
      ? await query(
          `UPDATE notification_preferences
              SET enabled = COALESCE($2, enabled),
                  min_severity = COALESCE($3, min_severity),
                  quiet_hours_start = $4,
                  quiet_hours_end = $5
            WHERE id = $1
            RETURNING *`,
          [existing.rows[0].id, enabled, minSeverity, quietStart, quietEnd]
        )
      : await query(
          `INSERT INTO notification_preferences
             (scope, client_id, machine_id, user_id, channel, enabled, min_severity,
              quiet_hours_start, quiet_hours_end)
           VALUES ($1,$2,$3,$4,$5, COALESCE($6,true), COALESCE($7,'warning'), $8, $9)
           RETURNING *`,
          [scope, clientId, machineId, userId, channel, enabled, minSeverity, quietStart, quietEnd]
        );

    await audit({
      action: 'notification_preferences.upsert',
      actorType: 'api',
      entityType: 'notification_preference',
      entityId: saved.rows[0]?.id,
      after: saved.rows[0],
      ip: clientIp(req),
    });
    sendOk(res, saved.rows[0] ?? null);
  });

  // =====================================================================
  // Alert thresholds (per machine, or a client/global default)
  // =====================================================================
  router.get('/api/v1/alert-thresholds', async (req, res) => {
    const { rows } = await query(
      `SELECT t.*, m.serial AS machine_serial, c.name AS client_name
         FROM alert_thresholds t
         LEFT JOIN machines m ON m.id = t.machine_id
         LEFT JOIN clients c ON c.id = t.client_id
        ORDER BY (t.machine_id IS NOT NULL) DESC, t.metric`
    );
    sendOk(res, rows);
  });

  router.put('/api/v1/alert-thresholds', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    const machineId = optionalUuid(body.machineId, 'machineId');
    const clientId = optionalUuid(body.clientId, 'clientId');
    const metric = optionalString(body.metric, 'metric', { max: 40 }) ?? 'temperature';

    const minValue = optionalNumber(body.minValue, 'minValue');
    const maxValue = optionalNumber(body.maxValue, 'maxValue');
    if (minValue === null && maxValue === null) {
      throw new ValidationError('Supply `minValue` and/or `maxValue`.');
    }
    if (minValue !== null && maxValue !== null && minValue >= maxValue) {
      throw new ValidationError('`minValue` must be lower than `maxValue`.');
    }

    const enabled = optionalBool(body.enabled, 'enabled');
    const severity = body.severity
      ? requireEnum(body.severity, 'severity', ['info', 'warning', 'critical'])
      : null;

    let saved;

    if (machineId) {
      // Per-machine override (enforced by the partial unique index).
      saved = await query(
        `INSERT INTO alert_thresholds
           (machine_id, client_id, metric, min_value, max_value, severity, enabled)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6,'critical'), COALESCE($7,true))
         ON CONFLICT (machine_id, metric) WHERE machine_id IS NOT NULL
         DO UPDATE SET min_value = EXCLUDED.min_value,
                       max_value = EXCLUDED.max_value,
                       severity  = EXCLUDED.severity,
                       enabled   = EXCLUDED.enabled
         RETURNING *`,
        [machineId, clientId, metric, minValue, maxValue, severity, enabled]
      );
    } else {
      // Client-level or global default: resolve then update, else insert.
      const existing = await query(
        `SELECT id FROM alert_thresholds
          WHERE metric = $1 AND machine_id IS NULL
            AND client_id IS NOT DISTINCT FROM $2
          LIMIT 1`,
        [metric, clientId]
      );

      saved = existing.rows[0]
        ? await query(
            `UPDATE alert_thresholds
                SET min_value = $2, max_value = $3,
                    severity = COALESCE($4, severity),
                    enabled = COALESCE($5, enabled)
              WHERE id = $1
              RETURNING *`,
            [existing.rows[0].id, minValue, maxValue, severity, enabled]
          )
        : await query(
            `INSERT INTO alert_thresholds
               (machine_id, client_id, metric, min_value, max_value, severity, enabled)
             VALUES (NULL,$1,$2,$3,$4, COALESCE($5,'critical'), COALESCE($6,true))
             RETURNING *`,
            [clientId, metric, minValue, maxValue, severity, enabled]
          );
    }

    await audit({
      action: 'alert_threshold.upsert',
      actorType: 'api',
      entityType: 'alert_threshold',
      entityId: saved.rows[0]?.id,
      after: { machineId, clientId, metric, minValue, maxValue },
      ip: clientIp(req),
    });
    sendOk(res, saved.rows[0] ?? null);
  });

  // =====================================================================
  // Audit trail (read-only)
  // =====================================================================
  router.get('/api/v1/audit-logs', async (req, res) => {
    const search = q(req);
    const limit = clampLimit(search.get('limit'), { def: 100, max: 500 });
    const offset = clampOffset(search.get('offset'));

    const params = [];
    const clauses = [];
    const action = optionalString(search.get('action'), 'action', { max: 80 });
    if (action) {
      params.push(action);
      clauses.push(`action = $${params.length}`);
    }
    const entityType = optionalString(search.get('entityType'), 'entityType', { max: 60 });
    if (entityType) {
      params.push(entityType);
      clauses.push(`entity_type = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT id, actor_type, actor_label, action, entity_type, entity_id,
              metadata, ip, created_at
         FROM audit_logs
         ${where}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    sendOk(res, rows, { limit, offset });
  });

  // Keeps the unused-import linter honest about intentionally reserved helpers.
  void [optionalInt, UUID_RE, lastPathSegment];
}