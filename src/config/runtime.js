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

function safeGatewayBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || typeof window === 'undefined' || !window.location) return DEFAULT_RUNTIME_CONFIG.gatewayBaseUrl;
  try {
    const url = new URL(raw, window.location.origin);
    const localHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
    const sameOrigin = url.origin === window.location.origin;
    const safeProtocol = url.protocol === 'https:' || (localHost && url.protocol === 'http:');
    if (!sameOrigin && !(localHost && safeProtocol)) return DEFAULT_RUNTIME_CONFIG.gatewayBaseUrl;
    return url.href.replace(/\/+$/, '');
  } catch (error) {
    return DEFAULT_RUNTIME_CONFIG.gatewayBaseUrl;
  }
}

export function getGatewayBaseUrl() {
  const candidate = readQueryValue('gateway') || readStorageValue(GATEWAY_STORAGE_KEY) || DEFAULT_RUNTIME_CONFIG.gatewayBaseUrl;
  return setGatewayBaseUrl(safeGatewayBaseUrl(candidate));
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
