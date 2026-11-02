import { config } from '../config.js';
import { AppError, ProviderError, ValidationError } from '../lib/errors.js';
import { httpRequest } from './http-client.js';

function cleanText(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function safeUrl(value) {
  const raw = cleanText(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function customizeValues(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    return {
      color: cleanText(item.color, 80),
      value: item.value,
      label: cleanText(item.instrucy, 200),
    };
  }).filter(Boolean);
}

export function normalizeVendorTemplatesResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProviderError('VENDOR_TEMPLATE_INVALID_RESPONSE', 'Vendor template service returned invalid JSON');
  }
  if ([401, 403].includes(Number(body.code))) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session has expired. Please sign in again.', { status: 401 });
  }
  if (Number(body.code) !== 200) {
    throw new ProviderError('VENDOR_TEMPLATE_REJECTED', 'Vendor template service rejected the request', { status: 502 });
  }
  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.records)) {
    throw new ProviderError('VENDOR_TEMPLATE_INVALID_RESPONSE', 'Vendor template response is missing records', { status: 502 });
  }

  return {
    records: data.records.map((record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
      return {
        id: integer(record.id),
        templateName: cleanText(record.templateName, 200),
        points: (Array.isArray(record.templateLocation) ? record.templateLocation : []).map((point) => {
          if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
          return {
            id: integer(point.id),
            keyName: cleanText(point.templateKeyName, 128),
            dataType: integer(point.templateType),
            reportsChanges: integer(point.templateIsChange),
            unit: cleanText(point.templateUnit, 40),
            iconId: integer(point.templateIcon),
            customize: customizeValues(point.templateCustomize),
            templateId: integer(point.templateId),
            showType: integer(point.templateShow),
            path: safeUrl(point.path),
            sensorName: cleanText(point.sensorName, 200),
            sort: integer(point.templateSort),
          };
        }).filter(Boolean),
      };
    }).filter(Boolean),
    pagination: {
      total: integer(data.total) ?? 0,
      page: integer(data.current) ?? 1,
      pageSize: integer(data.size) ?? 20,
      totalPages: integer(data.pages) ?? 0,
    },
  };
}

function templateUrl() {
  let url;
  try {
    url = new URL(config.auth.vendor.templateListUrl);
  } catch {
    throw new ProviderError('VENDOR_TEMPLATE_CONFIGURATION_ERROR', 'Vendor template URL is invalid', { status: 503 });
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (config.env === 'production' && url.protocol !== 'https:')) {
    throw new ProviderError('VENDOR_TEMPLATE_CONFIGURATION_ERROR', 'Vendor template URL is not allowed', { status: 503 });
  }
  return url;
}

export async function fetchVendorTemplates({ token, pageNum = 1, pageSize = 20 } = {}) {
  const accessToken = cleanText(token, 8192);
  if (!accessToken) throw new ValidationError('A vendor access token is required');
  const response = await httpRequest({
    url: templateUrl().toString(),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: accessToken,
    },
    body: {
      pageNum: String(pageNum),
      pageSize: String(pageSize),
    },
    timeoutMs: config.auth.vendor.deviceTimeoutMs,
    provider: 'Vendor template service',
  });
  return normalizeVendorTemplatesResponse(response.body);
}
