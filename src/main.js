import { createBsfApp } from './app.js';

const app = createBsfApp();

if (typeof window !== 'undefined') {
  window.BSF_APP = app;
  window.BSF_API = app.backend;
  window.BSF_GATEWAY = app.gateway;
  window.BSF_API_CONFIG = {
    baseUrl: app.runtime.apiBaseUrl,
    enabled: false,
    timeout: app.runtime.requestTimeoutMs
  };
  window.dispatchEvent(new Event('bsf:api-ready'));
}

export default app;
