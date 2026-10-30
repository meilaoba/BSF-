import { config } from '../config.js';
import { AppError, ProviderError } from '../lib/errors.js';
import { md5Upper } from '../lib/crypto.js';

const MAX_RESPONSE_BYTES = 64 * 1024;

const ROLE_BY_VENDOR_TYPE = Object.freeze({
  1: 'master_admin',
  2: 'client_admin',
  3: 'user',
});

export function mapVendorRole(type) {
  const numericType = Number(type);
  return ROLE_BY_VENDOR_TYPE[numericType] || null;
}

function invalidCredentials() {
  return new AppError('INVALID_CREDENTIALS', 'Invalid username or password', { status: 401 });
}

function cleanText(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function validateVendorUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.loginUrl);
  } catch {
    throw new AppError('AUTH_CONFIGURATION_ERROR', 'Vendor login URL is invalid', { status: 503 });
  }

  if (config.env === 'production' && url.protocol !== 'https:') {
    throw new AppError('AUTH_CONFIGURATION_ERROR', 'Vendor login URL must use HTTPS', { status: 503 });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError('AUTH_CONFIGURATION_ERROR', 'Vendor login URL protocol is not allowed', { status: 503 });
  }
  return url;
}

function validateVendorRefreshUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.refreshUrl);
  } catch {
    throw new AppError('AUTH_CONFIGURATION_ERROR', 'Vendor refresh URL is invalid', { status: 503 });
  }
  if (config.env === 'production' && url.protocol !== 'https:') {
    throw new AppError('AUTH_CONFIGURATION_ERROR', 'Vendor refresh URL must use HTTPS', { status: 503 });
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AppError('AUTH_CONFIGURATION_ERROR', 'Vendor refresh URL protocol is not allowed', { status: 503 });
  }
  return url;
}

async function readLimitedJson(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ProviderError('VENDOR_AUTH_RESPONSE_TOO_LARGE', 'Vendor login response was too large');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('VENDOR_AUTH_INVALID_RESPONSE', 'Vendor login returned an empty response');

  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProviderError('VENDOR_AUTH_RESPONSE_TOO_LARGE', 'Vendor login response was too large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError('VENDOR_AUTH_INVALID_RESPONSE', 'Vendor login returned invalid JSON');
  }
}

/**
 * Calls the vendor login API from the server only. Passwords are never logged,
 * and the vendor tokens are returned to the caller for encrypted storage.
 */
export async function loginWithVendor(userName, password) {
  if (!config.auth.enabled) {
    throw new AppError('AUTH_NOT_CONFIGURED', 'Authentication is not configured', { status: 503 });
  }

  const url = validateVendorUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.auth.vendor.timeoutMs);
  const payload = {
    userName,
    userPass: md5Upper(password),
  };
  const isJson = config.auth.vendor.requestFormat === 'json';

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
      },
      body: isJson ? JSON.stringify(payload) : new URLSearchParams(payload).toString(),
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ProviderError('AUTH_SERVICE_TIMEOUT', 'Authentication service timed out', { status: 504 });
    }
    // Do not include the URL or request body in the client-visible error.
    throw new ProviderError('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable', { status: 503 });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Consume/cancel the body so sockets can be released, but never expose it.
    await response.body?.cancel().catch(() => {});
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw invalidCredentials();
    }
    throw new ProviderError('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable', { status: 503 });
  }

  const body = await readLimitedJson(response);
  if (Number(body?.code) !== 200) throw invalidCredentials();

  const data = body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ProviderError('VENDOR_AUTH_INVALID_RESPONSE', 'Vendor login response is missing user data');
  }

  const role = mapVendorRole(data.type);
  if (!role) {
    throw new AppError('UNSUPPORTED_ACCOUNT_TYPE', 'This account type is not supported', { status: 403 });
  }

  const vendorUserId = cleanText(data.id, 120);
  const vendorUserName = cleanText(data.userName, 200);
  const token = cleanText(data.token, 8192);
  const refreshToken = cleanText(data.refreshToken, 8192);
  if (!vendorUserId || !vendorUserName || !token) {
    throw new ProviderError('VENDOR_AUTH_INVALID_RESPONSE', 'Vendor login response is incomplete');
  }

  return {
    vendorUser: {
      id: vendorUserId,
      userName: vendorUserName,
      type: Number(data.type),
      role,
      mobile: cleanText(data.mobile, 40),
      email: cleanText(data.email, 254),
      userState: Number.isFinite(Number(data.userState)) ? Number(data.userState) : null,
      parentId: cleanText(data.parentId, 120),
      parentName: cleanText(data.parentName, 200),
      userIcon: cleanText(data.userIcon, 1000),
      createTime: Number.isFinite(Number(data.createTime)) ? Number(data.createTime) : null,
    },
    token,
    refreshToken,
  };
}

export async function refreshVendorToken(accessToken, refreshToken) {
  const currentAccessToken = cleanText(accessToken, 8192);
  const currentRefreshToken = cleanText(refreshToken, 8192);
  if (!config.auth.enabled) {
    throw new AppError('AUTH_NOT_CONFIGURED', 'Authentication is not configured', { status: 503 });
  }
  if (!currentAccessToken || !currentRefreshToken) {
    throw new AppError('REFRESH_TOKEN_INVALID', 'Refresh token is unavailable. Please sign in again.', { status: 401 });
  }

  const url = validateVendorRefreshUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.auth.vendor.timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        token: currentAccessToken,
      },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ProviderError('AUTH_SERVICE_TIMEOUT', 'Authentication service timed out', { status: 504 });
    }
    throw new ProviderError('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable', { status: 503 });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if ([400, 401, 403].includes(response.status)) {
      throw new AppError('REFRESH_TOKEN_INVALID', 'Vendor session expired. Please sign in again.', { status: 401 });
    }
    throw new ProviderError('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable', { status: 503 });
  }

  const body = await readLimitedJson(response);
  if (Number(body?.code) !== 200) {
    throw new AppError('REFRESH_TOKEN_INVALID', 'Vendor session expired. Please sign in again.', { status: 401 });
  }
  const data = body?.data;
  const token = cleanText(data?.token, 8192);
  if (!data || typeof data !== 'object' || Array.isArray(data) || !token) {
    throw new ProviderError('VENDOR_AUTH_INVALID_RESPONSE', 'Vendor refresh response is incomplete');
  }
  return {
    token,
    refreshToken: cleanText(data.refreshToken, 8192) || currentRefreshToken,
    vendorUser: data,
  };
}
