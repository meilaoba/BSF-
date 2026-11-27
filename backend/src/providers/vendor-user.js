import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError, ProviderError, ValidationError } from '../lib/errors.js';
import { md5Upper } from '../lib/crypto.js';
import { httpRequest } from './http-client.js';

const USER_PASSWORD_KEY = Buffer.from('iotDeviceManage1', 'utf8');
const USER_PASSWORD_IV = Buffer.from('Singapore0000001', 'utf8');

function cleanText(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function integer(value, { min = 0 } = {}) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min ? number : null;
}

function userRequestTimeout(value, deadlineAt = null) {
  const configured = Math.max(
    1000,
    Math.min(Number(config.auth.vendor.userTimeoutMs) || 8000, 15000)
  );
  const requested = Number(value);
  const base = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, configured)
    : configured;
  const hasDeadline = deadlineAt !== null
    && deadlineAt !== undefined
    && Number.isFinite(Number(deadlineAt));
  const remaining = hasDeadline
    ? Math.floor(Number(deadlineAt) - Date.now())
    : base;
  if (remaining < 250) {
    throw new ProviderError(
      'VENDOR_USER_OPERATION_TIMEOUT',
      'Vendor user operation exceeded its time budget',
      { status: 408, retryable: true }
    );
  }
  return Math.max(250, Math.min(base, remaining));
}

export function encryptVendorUserPassword(password) {
  const text = String(password || '');
  if (!text) throw new ValidationError('An initial password is required');
  const cipher = crypto.createCipheriv('aes-128-cbc', USER_PASSWORD_KEY, USER_PASSWORD_IV);
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
}

function userAddUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.userAddUrl);
  } catch {
    throw new ProviderError('VENDOR_USER_ADD_CONFIGURATION_ERROR', 'Vendor user-add URL is invalid', {
      status: 503,
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (config.env === 'production' && url.protocol !== 'https:')) {
    throw new ProviderError('VENDOR_USER_ADD_CONFIGURATION_ERROR', 'Vendor user-add URL is not allowed', {
      status: 503,
    });
  }
  return url;
}

function userListUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.userListUrl);
  } catch {
    throw new ProviderError('VENDOR_USER_LIST_CONFIGURATION_ERROR', 'Vendor user-list URL is invalid', {
      status: 503,
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (config.env === 'production' && url.protocol !== 'https:')) {
    throw new ProviderError('VENDOR_USER_LIST_CONFIGURATION_ERROR', 'Vendor user-list URL is not allowed', {
      status: 503,
    });
  }
  return url;
}

function userUpdateUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.userUpdateUrl);
  } catch {
    throw new ProviderError('VENDOR_USER_UPDATE_CONFIGURATION_ERROR', 'Vendor user-update URL is invalid', {
      status: 503,
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (config.env === 'production' && url.protocol !== 'https:')) {
    throw new ProviderError('VENDOR_USER_UPDATE_CONFIGURATION_ERROR', 'Vendor user-update URL is not allowed', {
      status: 503,
    });
  }
  return url;
}

function userDeleteUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.userDeleteUrl);
  } catch {
    throw new ProviderError('VENDOR_USER_DELETE_CONFIGURATION_ERROR', 'Vendor user-delete URL is invalid', {
      status: 503,
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (config.env === 'production' && url.protocol !== 'https:')) {
    throw new ProviderError('VENDOR_USER_DELETE_CONFIGURATION_ERROR', 'Vendor user-delete URL is not allowed', {
      status: 503,
    });
  }
  return url;
}

function userPasswordUrl(kind) {
  const isReset = kind === 'reset';
  const raw = isReset
    ? config.auth.vendor.userResetPasswordUrl
    : config.auth.vendor.userUpdatePasswordUrl;
  const code = isReset
    ? 'VENDOR_USER_RESET_PASSWORD_CONFIGURATION_ERROR'
    : 'VENDOR_USER_UPDATE_PASSWORD_CONFIGURATION_ERROR';
  const label = isReset ? 'Vendor user password reset' : 'Vendor user password update';
  let url;
  try {
    url = new URL(raw);
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

function vendorUserResponseError(response, { code, service }) {
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

export async function addVendorUser({
  token,
  userName,
  password,
  mobile,
  userIcon = '',
  status = 1,
  timeoutMs,
  deadlineAt = null,
} = {}) {
  const accessToken = cleanText(token, 8192);
  const name = cleanText(userName, 200);
  const phone = cleanText(mobile, 40);
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!name) throw new ValidationError('A user name is required');
  if (!phone) throw new ValidationError('A mobile number is required');

  const response = await httpRequest({
    url: userAddUrl().toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: {
      userName: name,
      userPass: encryptVendorUserPassword(password),
      mobile: phone,
      userIcon: cleanText(userIcon, 2000) || '',
      status: Number(status) === 0 ? 0 : 1,
    },
    timeoutMs: userRequestTimeout(timeoutMs, deadlineAt),
    provider: 'Vendor user-add service',
  });
  if ([401, 403, 2002].includes(Number(response.body?.code))) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', {
      status: 401,
    });
  }
  if (Number(response.body?.code) !== 200) {
    throw new AppError(
      'VENDOR_USER_ADD_REJECTED',
      cleanText(response.body?.msg, 300) || 'Vendor user-add service rejected the request',
      {
        status: 409,
        details: {
          vendorCode: Number(response.body?.code),
        },
      }
    );
  }
  return {
    userName: name,
    mobile: phone,
    message: cleanText(response.body?.msg, 300),
  };
}

export async function updateVendorUser({
  token,
  id,
  userName,
  mobile,
  userIcon,
  userState,
} = {}) {
  const accessToken = cleanText(token, 8192);
  const userId = integer(id, { min: 1 });
  const name = cleanText(userName, 200);
  const phone = cleanText(mobile, 40);
  const icon = cleanText(userIcon, 2000);
  const state = userState === undefined || userState === null || userState === ''
    ? null
    : integer(userState, { min: 0 });
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!userId) throw new ValidationError('A vendor user id is required');
  if (state !== null && ![0, 1].includes(state)) {
    throw new ValidationError('Vendor user state must be 0 or 1');
  }

  const body = { id: userId };
  if (name) body.userName = name;
  if (phone) body.mobile = phone;
  if (icon) body.userIcon = icon;
  if (state !== null) body.userState = state;
  if (Object.keys(body).length === 1) {
    throw new ValidationError('At least one vendor user field must be supplied');
  }

  const response = await httpRequest({
    url: userUpdateUrl().toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body,
    timeoutMs: config.auth.vendor.deviceTimeoutMs,
    provider: 'Vendor user-update service',
  });
  vendorUserResponseError(response, {
    code: 'VENDOR_USER_UPDATE_REJECTED',
    service: 'Vendor user-update service',
  });
  return {
    id: userId,
    message: cleanText(response.body?.msg, 300),
  };
}

export async function deleteVendorUser({ token, id } = {}) {
  const accessToken = cleanText(token, 8192);
  const userId = integer(id, { min: 1 });
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!userId) throw new ValidationError('A vendor user id is required');

  const response = await httpRequest({
    url: userDeleteUrl().toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: { id: userId },
    timeoutMs: config.auth.vendor.deviceTimeoutMs,
    provider: 'Vendor user-delete service',
  });
  if (Number(response.body?.code) === 4002) {
    return {
      id: userId,
      message: cleanText(response.body?.msg, 300),
      alreadyDeleted: true,
    };
  }
  vendorUserResponseError(response, {
    code: 'VENDOR_USER_DELETE_REJECTED',
    service: 'Vendor user-delete service',
  });
  return {
    id: userId,
    message: cleanText(response.body?.msg, 300),
  };
}

export async function changeVendorUserPassword({
  token,
  id,
  currentPassword,
  newPassword,
} = {}) {
  const accessToken = cleanText(token, 8192);
  const userId = integer(id, { min: 1 });
  const current = typeof currentPassword === 'string' ? currentPassword : '';
  const next = typeof newPassword === 'string' ? newPassword : '';
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!userId) throw new ValidationError('A vendor user id is required');
  if (!current || current.length > 256) {
    throw new ValidationError('The current password is required and must be at most 256 characters');
  }
  if (next.length < 8 || next.length > 256) {
    throw new ValidationError('The new password must be between 8 and 256 characters');
  }
  if (current === next) {
    throw new ValidationError('The new password must be different from the current password');
  }

  const response = await httpRequest({
    url: userPasswordUrl('update').toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: {
      id: userId,
      oldPassword: md5Upper(current),
      newPassword: encryptVendorUserPassword(next),
    },
    timeoutMs: userRequestTimeout(),
    provider: 'Vendor user password update service',
  });
  if ([401, 403, 2002].includes(Number(response.body?.code))) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', {
      status: 401,
    });
  }
  if (Number(response.body?.code) === 4003) {
    throw new AppError('VENDOR_PASSWORD_INVALID', 'The current password is incorrect', {
      status: 400,
      details: { vendorCode: 4003 },
    });
  }
  if (Number(response.body?.code) !== 200) {
    throw new ProviderError(
      'VENDOR_PASSWORD_UPDATE_REJECTED',
      cleanText(response.body?.msg, 300) || 'Vendor password update failed',
      { status: 502, details: { vendorCode: Number(response.body?.code) } }
    );
  }
  return {
    id: userId,
    message: cleanText(response.body?.msg, 300),
  };
}

export async function resetVendorUserPassword({ token, id } = {}) {
  const accessToken = cleanText(token, 8192);
  const userId = integer(id, { min: 1 });
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!userId) throw new ValidationError('A vendor user id is required');

  const response = await httpRequest({
    url: userPasswordUrl('reset').toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: { id: userId },
    timeoutMs: userRequestTimeout(),
    provider: 'Vendor user password reset service',
  });
  if ([401, 403, 2002].includes(Number(response.body?.code))) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', {
      status: 401,
    });
  }
  if (Number(response.body?.code) === 4003) {
    throw new AppError('VENDOR_PASSWORD_RESET_TARGET_NOT_FOUND', 'The vendor user no longer exists', {
      status: 404,
      details: { vendorCode: 4003 },
    });
  }
  if (Number(response.body?.code) !== 200) {
    throw new ProviderError(
      'VENDOR_PASSWORD_RESET_REJECTED',
      cleanText(response.body?.msg, 300) || 'Vendor password reset failed',
      { status: 502, details: { vendorCode: Number(response.body?.code) } }
    );
  }
  return {
    id: userId,
    temporaryPassword: '123456',
    message: cleanText(response.body?.msg, 300),
  };
}

export async function listVendorUsers({
  token,
  userId,
  userName = '',
  pageNum = 1,
  pageSize = 100,
  timeoutMs,
  deadlineAt = null,
} = {}) {
  const accessToken = cleanText(token, 8192);
  const ownerId = integer(userId, { min: 1 });
  const page = integer(pageNum, { min: 1 });
  const size = integer(pageSize, { min: 1 });
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  if (!ownerId) throw new ValidationError('A vendor user id is required');
  if (!page || !size) throw new ValidationError('Vendor user pagination is invalid');

  const response = await httpRequest({
    url: userListUrl().toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: {
      userName: cleanText(userName, 200) || '',
      userId: ownerId,
      pageSize: size,
      pageNum: page,
    },
    timeoutMs: userRequestTimeout(timeoutMs, deadlineAt),
    provider: 'Vendor user-list service',
  });
  if ([401, 403, 2002].includes(Number(response.body?.code))) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', {
      status: 401,
    });
  }
  if (Number(response.body?.code) !== 200) {
    throw new ProviderError(
      'VENDOR_USER_LIST_REJECTED',
      cleanText(response.body?.msg, 300) || 'Vendor user-list service rejected the request',
      { status: 502 }
    );
  }
  const data = response.body?.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.records)) {
    throw new ProviderError(
      'VENDOR_USER_LIST_INVALID_RESPONSE',
      'Vendor user-list service returned an invalid response',
      { status: 502 }
    );
  }
  return {
    records: data.records.map((record) => ({
      id: integer(record?.id, { min: 1 }),
      userName: cleanText(record?.userName, 200),
      mobile: cleanText(record?.mobile, 40),
      userState: integer(record?.userState),
      parentId: integer(record?.parentId),
      userType: integer(record?.userType),
      createTime: integer(record?.createTime),
      updateTime: integer(record?.updateTime),
      email: cleanText(record?.email, 254),
      userIcon: cleanText(record?.userIcon, 2000),
    })).filter((record) => record.id && record.userName),
    pagination: {
      total: integer(data.total) ?? 0,
      size: integer(data.size) ?? size,
      current: integer(data.current) ?? page,
      pages: integer(data.pages) ?? 0,
    },
  };
}

export async function listAllVendorUsers({
  token,
  userId,
  userName = '',
  maxPages = 20,
} = {}) {
  const limit = Math.max(1, Math.min(Number(maxPages) || 20, 100));
  const first = await listVendorUsers({
    token,
    userId,
    userName,
    pageNum: 1,
    pageSize: 100,
  });
  const records = [...first.records];
  const pages = Math.max(1, Math.min(Number(first.pagination.pages) || 1, limit));

  for (let start = 2; start <= pages; start += 4) {
    const pageNumbers = [];
    for (let pageNum = start; pageNum <= Math.min(pages, start + 3); pageNum += 1) {
      pageNumbers.push(pageNum);
    }
    const pageResults = await Promise.all(pageNumbers.map((pageNum) => listVendorUsers({
      token,
      userId,
      userName,
      pageNum,
      pageSize: 100,
    })));
    for (const page of pageResults) records.push(...page.records);
  }

  const unique = new Map();
  for (const record of records) {
    if (record?.id) unique.set(String(record.id), record);
  }
  return {
    records: Array.from(unique.values()),
    pagination: {
      ...first.pagination,
      current: 1,
      pages,
      total: Math.max(first.pagination.total, unique.size),
    },
  };
}

export async function findVendorUserByName({
  token,
  userId,
  userName,
  maxPages = 20,
  timeoutMs,
  deadlineAt = null,
} = {}) {
  const target = cleanText(userName, 200);
  if (!target) return null;
  let pageNum = 1;
  let pages = 1;
  do {
    const result = await listVendorUsers({
      token,
      userId,
      userName: target,
      pageNum,
      pageSize: 100,
      timeoutMs,
      deadlineAt,
    });
    const match = result.records.find((record) => (
      record.userName.toLowerCase() === target.toLowerCase()
    ));
    if (match) return match;
    pages = Math.max(1, Math.min(result.pagination.pages || pageNum, maxPages));
    pageNum += 1;
  } while (pageNum <= pages);
  return null;
}
