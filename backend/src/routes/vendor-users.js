import { query, audit } from '../db.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { clientIp, readJsonBody, sendOk } from '../lib/http.js';
import { optionalInt, optionalString, optionalUuid } from '../lib/validate.js';
import { requireApiKey } from '../middleware/auth.js';
import { getVendorAccessToken } from '../middleware/session.js';
import { deleteVendorUser, listAllVendorUsers } from '../providers/vendor-user.js';
import {
  listVendorUserAssignments,
  replaceVendorUserAssignments,
} from '../providers/vendor-user-devices.js';
import { loadCollectorCredentials } from '../services/vendor-collector.js';

function q(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

function requireUserManager(req) {
  const role = req.auth?.user?.role;
  if (role === 'master_admin' || role === 'client_admin') return;
  if (req.auth) throw new ForbiddenError();
  requireApiKey(req);
}

async function vendorCredentials(req) {
  if (req.auth) {
    return {
      token: await getVendorAccessToken(req.auth),
      userId: req.auth.user?.vendorUserId,
    };
  }
  const collector = await loadCollectorCredentials();
  return {
    token: collector?.accessToken || null,
    userId: collector?.vendorUserId || null,
  };
}

async function assertClientAdminCanManageUser(req, user) {
  if (req.auth?.user?.role !== 'client_admin') return;
  const vendorAccountId = req.auth.user.vendorUserId;
  if (!vendorAccountId) throw new ForbiddenError('Account has no vendor account identity');
  if (user.role !== 'user') throw new ForbiddenError();
  if (String(user.metadata?.vendorAccountId || '') === String(vendorAccountId)) return;
  if (!user.client_id) throw new ForbiddenError();
  const { rows } = await query(
    `SELECT 1
       FROM clients
      WHERE id = $1
        AND vendor_account_id = $2`,
    [user.client_id, vendorAccountId]
  );
  if (!rows[0]) throw new ForbiddenError();
}

async function loadManagedUser(req, userId) {
  const { rows } = await query(
    `SELECT id, vendor_user_id, vendor_username, vendor_type, email, phone, full_name,
            role, client_id, machine_id, status, metadata
       FROM users
      WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) throw new NotFoundError('User not found');
  await assertClientAdminCanManageUser(req, rows[0]);
  if (!rows[0].vendor_user_id) {
    throw new AppError('VENDOR_USER_NOT_LINKED', 'This user has no linked vendor account', {
      status: 409,
    });
  }
  return rows[0];
}

async function enrichDevices(assignments) {
  const ids = Array.from(new Set(
    [...assignments.assignedList, ...assignments.unassignedList]
      .map((device) => String(device.id))
  ));
  if (!ids.length) return assignments;

  const { rows } = await query(
    `SELECT id, vendor_device_id, serial, name, client_id
       FROM machines
      WHERE vendor_device_id = ANY($1::text[])`,
    [ids]
  );
  const localByVendorId = new Map(rows.map((row) => [String(row.vendor_device_id), row]));
  const enrich = (device) => {
    const local = localByVendorId.get(String(device.id));
    return {
      ...device,
      localMachineId: local?.id || null,
      serial: local?.serial || device.deviceSerialNum || null,
      name: local?.name || device.deviceName || device.deviceSerialNum || null,
      clientId: local?.client_id || null,
    };
  };
  return {
    assignedList: assignments.assignedList.map(enrich),
    unassignedList: assignments.unassignedList.map(enrich),
  };
}

function vendorUserPayload(record, localRow) {
  return {
    id: localRow?.id || null,
    vendorUserId: String(record.id),
    userName: record.userName,
    mobile: record.mobile,
    email: localRow?.email || record.email || null,
    userState: record.userState,
    userType: record.userType,
    parentId: record.parentId,
    createTime: record.createTime,
    updateTime: record.updateTime,
    userIcon: record.userIcon,
    full_name: localRow?.full_name || record.userName,
    phone: localRow?.phone || record.mobile,
    role: localRow?.role || null,
    client_id: localRow?.client_id || null,
    client_name: localRow?.client_name || null,
    machine_id: localRow?.machine_id || null,
    machine_serial: localRow?.machine_serial || null,
    machine_name: localRow?.machine_name || null,
    status: localRow?.status || null,
    isManaged: Boolean(localRow),
  };
}

export function registerVendorUserRoutes(router) {
  router.get('/api/v1/vendor-users', async (req, res) => {
    requireUserManager(req);
    const credentials = await vendorCredentials(req);
    const ownerId = Number(credentials.userId);
    if (!credentials.token || !Number.isInteger(ownerId) || ownerId < 1) {
      throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor account identity is unavailable', {
        status: 401,
      });
    }

    const remote = await listAllVendorUsers({
      token: credentials.token,
      userId: ownerId,
      userName: optionalString(q(req).get('userName'), 'userName', { max: 200 }) || '',
    });
    const vendorIds = remote.records.map((record) => String(record.id));
    let localRows = [];
    if (vendorIds.length) {
      const vendorAccountId = req.auth?.user?.role === 'client_admin'
        ? req.auth.user.vendorUserId
        : null;
      const result = await query(
        `SELECT u.id, u.vendor_user_id, u.full_name, u.email, u.phone, u.role,
                u.client_id, u.machine_id, u.status,
                c.name AS client_name, m.serial AS machine_serial, m.name AS machine_name
           FROM users u
           LEFT JOIN clients c ON c.id = u.client_id
           LEFT JOIN machines m ON m.id = u.machine_id
          WHERE u.vendor_user_id = ANY($1::text[])
            AND (
              $2::text IS NULL
              OR u.metadata->>'vendorAccountId' = $2
              OR c.vendor_account_id = $2
            )`,
        [vendorIds, vendorAccountId]
      );
      localRows = result.rows;
    }
    const localByVendorId = new Map(localRows.map((row) => [String(row.vendor_user_id), row]));
    const users = remote.records.map((record) => (
      vendorUserPayload(record, localByVendorId.get(String(record.id)) || null)
    ));
    sendOk(res, { users, actorVendorUserId: String(ownerId) }, {
      ...remote.pagination,
    });
  });

  router.get('/api/v1/vendor-users/assignments', async (req, res) => {
    requireUserManager(req);
    const localUserId = optionalUuid(q(req).get('userId'), 'userId');
    if (!localUserId) throw new ValidationError('`userId` is required');
    const localUser = await loadManagedUser(req, localUserId);
    const credentials = await vendorCredentials(req);
    const fromUserId = Number(credentials.userId);
    if (!credentials.token || !Number.isInteger(fromUserId) || fromUserId < 1) {
      throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor account identity is unavailable', {
        status: 401,
      });
    }

    const assignments = await listVendorUserAssignments({
      token: credentials.token,
      userId: Number(localUser.vendor_user_id),
    });
    sendOk(res, {
      userId: localUser.id,
      vendorUserId: String(localUser.vendor_user_id),
      fromUserId: String(fromUserId),
      ...(await enrichDevices(assignments)),
    });
  });

  router.delete('/api/v1/vendor-users', async (req, res) => {
    requireUserManager(req);
    const vendorUserId = optionalInt(q(req).get('vendorUserId'), 'vendorUserId', { min: 1 });
    if (!vendorUserId) throw new ValidationError('`vendorUserId` is required');

    const local = await query(
      'SELECT id FROM users WHERE vendor_user_id = $1 LIMIT 1',
      [String(vendorUserId)]
    );
    if (local.rows[0]) {
      throw new AppError(
        'VENDOR_USER_MANAGED',
        'This vendor account is linked to a BSF user. Delete it through the managed user record.',
        { status: 409 }
      );
    }

    const credentials = await vendorCredentials(req);
    const actorUserId = Number(credentials.userId);
    if (!credentials.token || !Number.isInteger(actorUserId) || actorUserId < 1) {
      throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor account identity is unavailable', {
        status: 401,
      });
    }
    const remote = await listAllVendorUsers({
      token: credentials.token,
      userId: actorUserId,
    });
    const target = remote.records.find((record) => String(record.id) === String(vendorUserId));
    if (!target) throw new NotFoundError('Vendor user not found');

    const result = await deleteVendorUser({
      token: credentials.token,
      id: vendorUserId,
    });
    const linkedAfterDelete = await query(
      'SELECT id FROM users WHERE vendor_user_id = $1 LIMIT 1',
      [String(vendorUserId)]
    );
    if (linkedAfterDelete.rows[0]) {
      throw new AppError(
        'VENDOR_USER_LOCAL_LINK_CREATED',
        'The vendor account was deleted, but a concurrent local link now exists. Reconcile this user.',
        { status: 502 }
      );
    }

    await audit({
      action: 'vendor_user.delete_unmanaged',
      actorType: 'api',
      actorId: req.auth?.user?.id || null,
      actorLabel: req.auth?.user?.userName || null,
      entityType: 'vendor_user',
      entityId: String(vendorUserId),
      after: {
        vendorUserId,
        userName: target.userName,
        alreadyDeleted: Boolean(result.alreadyDeleted),
      },
      ip: clientIp(req),
    });
    sendOk(res, {
      vendorUserId: String(vendorUserId),
      userName: target.userName,
      alreadyDeleted: Boolean(result.alreadyDeleted),
    });
  });

  router.put('/api/v1/vendor-users/assignments', async (req, res) => {
    requireUserManager(req);
    const body = await readJsonBody(req);
    const localUserId = optionalUuid(body.userId, 'userId');
    if (!localUserId) throw new ValidationError('`userId` is required');
    if (!Array.isArray(body.deviceId)) throw new ValidationError('`deviceId` must be an array');

    const localUser = await loadManagedUser(req, localUserId);
    const credentials = await vendorCredentials(req);
    const fromUserId = Number(credentials.userId);
    const targetVendorUserId = Number(localUser.vendor_user_id);
    if (!credentials.token || !Number.isInteger(fromUserId) || fromUserId < 1) {
      throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor account identity is unavailable', {
        status: 401,
      });
    }

    const before = await listVendorUserAssignments({
      token: credentials.token,
      userId: targetVendorUserId,
    });
    await replaceVendorUserAssignments({
      token: credentials.token,
      userId: targetVendorUserId,
      fromUserId,
      deviceIds: body.deviceId,
    });
    const after = await listVendorUserAssignments({
      token: credentials.token,
      userId: targetVendorUserId,
    });
    const enriched = await enrichDevices(after);

    await audit({
      action: 'vendor_user.device_assignment',
      actorType: 'api',
      actorId: req.auth?.user?.id || null,
      actorLabel: req.auth?.user?.userName || null,
      entityType: 'user',
      entityId: localUser.id,
      before: {
        vendorUserId: targetVendorUserId,
        deviceIds: before.assignedList.map((device) => device.id),
      },
      after: {
        vendorUserId: targetVendorUserId,
        fromUserId,
        deviceIds: enriched.assignedList.map((device) => device.id),
      },
      ip: clientIp(req),
    });
    sendOk(res, {
      userId: localUser.id,
      vendorUserId: String(targetVendorUserId),
      fromUserId: String(fromUserId),
      ...enriched,
    });
  });
}
