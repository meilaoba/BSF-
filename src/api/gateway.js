import { createHttpClient } from './http.js';

export function createGatewayApi(options = {}) {
  const baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
  const http = options.http || createHttpClient({ baseUrl, timeoutMs: options.timeoutMs || 10000 });
  const apiPrefix = /\/api\/gateway$/.test(baseUrl) ? '' : '/api';

  return {
    health() { return http.get(apiPrefix + '/health'); },
    latest() { return http.get(apiPrefix + '/latest'); },
    messages(limit = 50) { return http.get(apiPrefix + '/messages', { limit }); },
    async probe() {
      const health = await this.health();
      return health && health.status === 'up';
    }
  };
}

export function extractLatestDevice(message) {
  if (!message || !Array.isArray(message.devices) || !message.devices.length) return null;
  const device = message.devices[0];
  return {
    timestamp: message.timestamp,
    receivedAt: message.receivedAt,
    deviceId: device.deviceId,
    deviceState: device.deviceState,
    data: device.deviceData || {}
  };
}

export function normalizeGatewayMessages(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  return items.map(extractLatestDevice).filter(Boolean);
}
