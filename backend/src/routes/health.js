import { config } from '../config.js';
import { healthCheck } from '../db.js';
import { sendJson } from '../lib/http.js';
import { requireApiKey } from '../middleware/auth.js';
import { emailStatus } from '../providers/email.js';
import { whatsappStatus } from '../providers/whatsapp.js';
import { getQueueStats } from '../services/notifications.js';

export function publicHealthPayload(healthy, now = new Date()) {
  return healthy
    ? { ok: true, time: now.toISOString() }
    : {
        ok: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' },
        time: now.toISOString(),
      };
}

export function registerHealthRoutes(router) {
  // Public readiness probe. Keep this response intentionally minimal so the
  // internet cannot enumerate database names, versions or queue internals.
  router.get('/api/v1/health', async (req, res) => {
    let healthy = false;
    try {
      const db = await healthCheck();
      healthy = db.ok;
    } catch (err) {
      console.error('[health] database check failed:', err.message);
    }

    sendJson(res, healthy ? 200 : 503, publicHealthPayload(healthy));
  });

  // Lightweight liveness probe for nginx / systemd. This does not touch the
  // database and therefore only answers whether the process is accepting HTTP.
  router.get('/api/v1/ping', (req, res) => {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  });

  // Full operational detail is restricted to Master Admin sessions or trusted
  // service callers using x-api-key.
  router.get('/api/v1/internal/health', async (req, res) => {
    requireApiKey(req);
    const started = Date.now();
    const checks = { database: { ok: false }, queue: { ok: true } };
    let healthy = true;

    try {
      const db = await healthCheck();
      checks.database = { ok: db.ok, name: db.database, server: db.serverVersion, latencyMs: db.latencyMs };
      if (!db.ok) healthy = false;
    } catch (err) {
      healthy = false;
      checks.database = { ok: false, error: 'Database check failed' };
      console.error('[health] database check failed:', err.message);
    }

    try {
      checks.queue = { ok: true, stats: await getQueueStats() };
    } catch (err) {
      healthy = false;
      checks.queue = { ok: false, error: 'Queue check failed' };
      console.error('[health] queue check failed:', err.message);
    }

    sendJson(res, healthy ? 200 : 503, {
      ok: healthy,
      service: 'bsf-backend',
      env: config.env,
      version: '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      checks,
      providers: { email: emailStatus(), whatsapp: whatsappStatus() },
      time: new Date().toISOString(),
    });
  });

  /**
   * Non-secret view of the integration state so the dashboard can render
   * "Email: awaiting credentials" without guessing.
   */
  router.get('/api/v1/meta/providers', (req, res) => {
    sendJson(res, 200, {
      ok: true,
      data: { email: emailStatus(), whatsapp: whatsappStatus() },
    });
  });
}
