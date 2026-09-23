import { createBackendApi } from '../api/backend.js';
import { createGatewayApi, normalizeGatewayMessages } from '../api/gateway.js';

export function createDeviceService(options = {}) {
  const runtime = options.runtime || {};
  const gateway = options.gateway || createGatewayApi({ baseUrl: runtime.gatewayBaseUrl, timeoutMs: runtime.requestTimeoutMs });
  const backend = options.backend || createBackendApi({ baseUrl: runtime.apiBaseUrl, timeoutMs: runtime.requestTimeoutMs });

  return {
    getGatewayHealth() {
      return gateway.health();
    },

    async getLiveSnapshot(filters = {}) {
      if (runtime.mode === 'backend') {
        const data = await backend.getMachines(filters);
        return data && (data.latest || data.list || data);
      }
      const message = await gateway.latest();
      return message && message.empty ? null : message;
    },

    async getRecentDeviceRecords(limit = 50, filters = {}) {
      if (runtime.mode === 'backend') {
        const data = await backend.getRawData(Object.assign({ limit }, filters));
        return data && (data.list || data.items || data);
      }
      const payload = await gateway.messages(limit);
      return normalizeGatewayMessages(payload);
    },

    async getMachineList(filters = {}) {
      if (runtime.mode === 'backend') {
        const data = await backend.getMachines(filters);
        return data && (data.list || data);
      }
      const records = await this.getRecentDeviceRecords(1, filters);
      return records;
    },

    async getRawData(params = {}) {
      return backend.getRawData(params);
    },

    async getAlerts(params = {}) {
      return backend.getAlerts(params);
    }
  };
}
