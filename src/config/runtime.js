const GATEWAY_STORAGE_KEY = 'bsf.delivery.gatewayBaseUrl';
const API_STORAGE_KEY = 'bsf.delivery.apiBaseUrl';

export const DEFAULT_RUNTIME_CONFIG = {
  apiBaseUrl: '/api/v1',
  gatewayBaseUrl: '/api/gateway',
  requestTimeoutMs: 15000,
  refreshMs: {
    admin: 3 * 60 * 1000,
    clientAdmin: 10 * 60 * 1000,
    user: 10 * 60 * 1000
  }
};

function readQueryValue(name) {
  if (typeof window === 'undefined' || !window.location) return '';
  return new URLSearchParams(window.location.search).get(name) || '';
}

function readStorageValue(key) {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  return window.localStorage.getItem(key) || '';
}

export function setGatewayBaseUrl(value) {
  const clean = String(value || '').trim().replace(/\/+$/, '');
  if (clean && typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(GATEWAY_STORAGE_KEY, clean);
  return clean;
}

export function setApiBaseUrl(value) {
  const clean = String(value || '').trim().replace(/\/+$/, '');
  if (clean && typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(API_STORAGE_KEY, clean);
  return clean;
}

export function getGatewayBaseUrl() {
  return setGatewayBaseUrl(readQueryValue('gateway') || readStorageValue(GATEWAY_STORAGE_KEY) || DEFAULT_RUNTIME_CONFIG.gatewayBaseUrl);
}

export function getApiBaseUrl() {
  return setApiBaseUrl(readStorageValue(API_STORAGE_KEY) || DEFAULT_RUNTIME_CONFIG.apiBaseUrl);
}

export function resolveRuntimeConfig(overrides = {}) {
  return Object.assign({}, DEFAULT_RUNTIME_CONFIG, {
    apiBaseUrl: getApiBaseUrl(),
    gatewayBaseUrl: getGatewayBaseUrl()
  }, overrides);
}
