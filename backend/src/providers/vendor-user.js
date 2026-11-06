import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError, ProviderError, ValidationError } from '../lib/errors.js';
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

export async function addVendorUser({
  token,
  userName,
  password,
  mobile,
  userIcon = '',
  status = 1,
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
    timeoutMs: config.auth.vendor.deviceTimeoutMs,
    provider: 'Vendor user-add service',
  });
  if ([401, 403].includes(Number(response.body?.code))) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', {
      status: 401,
    });
  }
  if (Number(response.body?.code) !== 200) {
    throw new ProviderError(
      'VENDOR_USER_ADD_REJECTED',
      cleanText(response.body?.msg, 300) || 'Vendor user-add service rejected the request',
      { status: 502 }
    );
  }
  return {
    userName: name,
    mobile: phone,
    message: cleanText(response.body?.msg, 300),
  };
}

export async function listVendorUsers({
  token,
  userId,
  userName = '',
  pageNum = 1,
  pageSize = 100,
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
    timeoutMs: config.auth.vendor.deviceTimeoutMs,
    provider: 'Vendor user-list service',
  });
  if ([401, 403].includes(Number(response.body?.code))) {
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

export async function findVendorUserByName({ token, userId, userName, maxPages = 20 } = {}) {
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
