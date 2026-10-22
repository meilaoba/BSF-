import { createBsfApp } from './app.js';

const app = createBsfApp();

if (typeof window !== 'undefined') {
  try { sessionStorage.removeItem('bsf.delivery.sessionToken'); } catch (error) {}
  window.BSF_APP = app;
  window.BSF_API = app.backend;
  window.BSF_GATEWAY = app.gateway;
  window.BSF_AUTH_CONFIG = {
    baseUrl: app.runtime.apiBaseUrl,
    enabled: true,
    timeout: app.runtime.requestTimeoutMs
  };
  window.BSF_API_CONFIG = {
    baseUrl: app.runtime.apiBaseUrl,
    // Business-data API migration is separate from authentication. Keep this
    // false so only the login flow changes in this delivery.
    enabled: false,
    timeout: app.runtime.requestTimeoutMs
  };
  window.dispatchEvent(new Event('bsf:api-ready'));
}

export default app;
