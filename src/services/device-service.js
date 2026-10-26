import { createBackendApi } from '../api/backend.js';

export function createDeviceService(options = {}) {
  const runtime = options.runtime || {};
  const backend = options.backend || createBackendApi({
    baseUrl: runtime.apiBaseUrl,
    timeoutMs: runtime.requestTimeoutMs
  });

  return {
    getHealth() {
      return backend.health();
    },

    async getLiveSnapshot(filters = {}) {
      return backend.getMachines(filters);
    },

    async getRecentDeviceRecords(limit = 50, filters = {}) {
      return backend.getDeviceData(Object.assign({ limit }, filters));
    },

    async getMachineList(filters = {}) {
      return backend.getMachines(filters);
    },

    async getRawData(params = {}) {
      return backend.getDeviceData(params);
    },

    async getAlerts(params = {}) {
      return backend.getAlerts(params);
    }
  };
}
