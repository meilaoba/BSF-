import { resolveRuntimeConfig } from './config/runtime.js';
import { createBackendApi } from './api/backend.js';
import { createGatewayApi } from './api/gateway.js';
import { createDeviceService } from './services/device-service.js';

export function createBsfApp(overrides = {}) {
  const runtime = resolveRuntimeConfig(overrides);
  const backend = createBackendApi({
    baseUrl: runtime.apiBaseUrl,
    timeoutMs: runtime.requestTimeoutMs
  });
  const gateway = createGatewayApi({
    baseUrl: runtime.gatewayBaseUrl,
    timeoutMs: runtime.requestTimeoutMs
  });
  const deviceService = createDeviceService({ runtime, backend, gateway });
  return { runtime, backend, gateway, deviceService };
}
