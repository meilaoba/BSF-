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
