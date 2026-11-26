import { config } from '../config.js';
import { AppError, ProviderError, ValidationError } from '../lib/errors.js';
import { httpRequest } from './http-client.js';

function cleanText(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function integer(value, { min = 0 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min ? number : null;
}

function vendorUrl(value, { code, label }) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError(code, `${label} URL is invalid`, { status: 503 });
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (config.env === 'production' && url.protocol !== 'https:')) {
    throw new ProviderError(code, `${label} URL is not allowed`, { status: 503 });
  }
  return url;
}

function assignedUserUrl() {
  return vendorUrl(config.auth.vendor.assignedUserUrl, {
    code: 'VENDOR_ASSIGNED_USER_CONFIGURATION_ERROR',
    label: 'Vendor assigned-user',
  });
}

function allocateEquipmentUrl() {
  return vendorUrl(config.auth.vendor.allocateEquipmentUrl, {
    code: 'VENDOR_ALLOCATE_EQUIPMENT_CONFIGURATION_ERROR',
    label: 'Vendor allocate-equipment',
  });
}

function assertVendorSuccess(response, { code, service }) {
  if ([401, 403, 2002].includes(Number(response.body?.code))) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', {
      status: 401,
    });
  }
  if (Number(response.body?.code) !== 200) {
    throw new ProviderError(
      code,
      cleanText(response.body?.msg, 300) || `${service} rejected the request`,
      { status: 502 }
    );
  }
}

function mapAssignedDevice(record, fromUserIdField = null) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const id = integer(record.id, { min: 1 });
  if (!id) return null;
  return {
    id,
    deviceName: cleanText(record.deviceName, 300),
    deviceSerialNum: cleanText(record.deviceSerialNum, 160),
    ...(fromUserIdField
      ? { fromUserId: integer(record[fromUserIdField], { min: 1 }) }
      : {}),
  };
}

function normalizeAssignments(body) {
  const data = body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || !Array.isArray(data.assignedList)
    || !Array.isArray(data.unassignedList)) {
    throw new ProviderError(
      'VENDOR_ASSIGNED_USER_INVALID_RESPONSE',
      'Vendor assigned-user service returned an invalid response',
      { status: 502 }
    );
  }

  const unique = (records, field) => {
    const map = new Map();
    for (const record of records) {
      const mapped = mapAssignedDevice(record, field);
      if (mapped) map.set(String(mapped.id), mapped);
    }
    return Array.from(map.values());
  };
  return {
    assignedList: unique(data.assignedList, 'fromUserId'),
    unassignedList: unique(data.unassignedList, 'userId'),
  };
}

export async function listVendorUserAssignments({ token, userId } = {}) {
  const accessToken = cleanText(token, 8192);
  const targetUserId = integer(userId, { min: 1 });
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!targetUserId) throw new ValidationError('A vendor user id is required');

  const response = await httpRequest({
    url: assignedUserUrl().toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: { userId: targetUserId },
    timeoutMs: config.auth.vendor.deviceTimeoutMs,
    provider: 'Vendor assigned-user service',
  });
  assertVendorSuccess(response, {
    code: 'VENDOR_ASSIGNED_USER_REJECTED',
    service: 'Vendor assigned-user service',
  });
  return normalizeAssignments(response.body);
}

export async function replaceVendorUserAssignments({
  token,
  userId,
  fromUserId,
  deviceIds,
} = {}) {
  const accessToken = cleanText(token, 8192);
  const targetUserId = integer(userId, { min: 1 });
  const actorUserId = integer(fromUserId, { min: 1 });
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!targetUserId) throw new ValidationError('A vendor user id is required');
  if (!actorUserId) throw new ValidationError('A vendor actor user id is required');
  if (!Array.isArray(deviceIds)) throw new ValidationError('`deviceId` must be an array');

  const normalizedIds = [];
  const seen = new Set();
  for (const value of deviceIds) {
    const id = integer(value, { min: 1 });
    if (!id) throw new ValidationError('Every device id must be a positive integer');
    if (!seen.has(id)) {
      seen.add(id);
      normalizedIds.push(id);
    }
  }

  const response = await httpRequest({
    url: allocateEquipmentUrl().toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: {
      deviceId: normalizedIds,
      userIdList: targetUserId,
      fromUserId: actorUserId,
    },
    timeoutMs: config.auth.vendor.deviceTimeoutMs,
    provider: 'Vendor allocate-equipment service',
  });
  assertVendorSuccess(response, {
    code: 'VENDOR_ALLOCATE_EQUIPMENT_REJECTED',
    service: 'Vendor allocate-equipment service',
  });
  return {
    deviceId: normalizedIds,
    userIdList: targetUserId,
    fromUserId: actorUserId,
    message: cleanText(response.body?.msg, 300),
  };
}
