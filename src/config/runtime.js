const API_STORAGE_KEY = 'bsf.delivery.apiBaseUrl';

export const DEFAULT_RUNTIME_CONFIG = {
  apiBaseUrl: '/api/v1',
  requestTimeoutMs: 15000,
  humidityScale: 100,
  refreshMs: {
    admin: 30 * 60 * 1000,
    clientAdmin: 30 * 60 * 1000,
    user: 30 * 60 * 1000
  }
};

function readStorageValue(key) {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function sanitizeApiBaseUrl(value, origin = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parserOrigin = origin || (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    if (!parserOrigin) return raw === '/api/v1' || raw.startsWith('/api/v1/') ? raw.replace(/\/+$/, '') : '';
    const parsed = new URL(raw, parserOrigin);
    if (parsed.origin !== parserOrigin) return '';
    if (parsed.pathname !== '/api/v1' && !parsed.pathname.startsWith('/api/v1/')) return '';
    return parsed.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function setApiBaseUrl(value) {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const clean = sanitizeApiBaseUrl(value, origin);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (clean) window.localStorage.setItem(API_STORAGE_KEY, clean);
      else window.localStorage.removeItem(API_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in hardened browser contexts.
    }
  }
  return clean || DEFAULT_RUNTIME_CONFIG.apiBaseUrl;
}

export function getApiBaseUrl() {
  return setApiBaseUrl(readStorageValue(API_STORAGE_KEY) || DEFAULT_RUNTIME_CONFIG.apiBaseUrl);
}

export function resolveRuntimeConfig(overrides = {}) {
  return Object.assign({}, DEFAULT_RUNTIME_CONFIG, {
    apiBaseUrl: getApiBaseUrl()
  }, overrides);
}
