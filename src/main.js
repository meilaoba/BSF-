import { createBsfApp } from './app.js';
import * as metrics from './shared/metrics.js';

const app = createBsfApp();

if (typeof window !== 'undefined') {
  try { sessionStorage.removeItem('bsf.delivery.sessionToken'); } catch (error) {}
  window.BSF_APP = app;
  window.BSF_API = app.backend;
  window.BSF_METRICS = metrics;
  window.BSF_RUNTIME_CONFIG = app.runtime;
  window.BSF_AUTH_CONFIG = {
    baseUrl: app.runtime.apiBaseUrl,
    enabled: true,
    timeout: app.runtime.requestTimeoutMs
  };
  window.BSF_API_CONFIG = {
    baseUrl: app.runtime.apiBaseUrl,
    enabled: true,
    timeout: app.runtime.requestTimeoutMs
  };
  window.dispatchEvent(new Event('bsf:api-ready'));
}

export default app;
