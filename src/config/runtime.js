const API_STORAGE_KEY = 'bsf.delivery.apiBaseUrl';

export const DEFAULT_RUNTIME_CONFIG = {
  apiBaseUrl: '/api/v1',
  requestTimeoutMs: 15000,
  refreshMs: {
    admin: 3 * 60 * 1000,
    clientAdmin: 10 * 60 * 1000,
    user: 10 * 60 * 1000
  }
};

function readStorageValue(key) {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  return window.localStorage.getItem(key) || '';
}

export function setApiBaseUrl(value) {
  const clean = String(value || '').trim().replace(/\/+$/, '');
  if (clean && typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(API_STORAGE_KEY, clean);
  return clean;
}

export function getApiBaseUrl() {
  return setApiBaseUrl(readStorageValue(API_STORAGE_KEY) || DEFAULT_RUNTIME_CONFIG.apiBaseUrl);
}

export function resolveRuntimeConfig(overrides = {}) {
  return Object.assign({}, DEFAULT_RUNTIME_CONFIG, {
    apiBaseUrl: getApiBaseUrl()
  }, overrides);
}
