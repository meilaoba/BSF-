import { config } from '../config.js';
import { healthCheck } from '../db.js';
import { sendJson } from '../lib/http.js';
import { emailStatus } from '../providers/email.js';
import { whatsappStatus } from '../providers/whatsapp.js';
import { getQueueStats } from '../services/notifications.js';

export function registerHealthRoutes(router) {
  router.get('/api/v1/health', async (req, res) => {
    const started = Date.now();
    const checks = { database: { ok: false }, queue: { ok: true } };

    let healthy = true;

    try {
      const db = await healthCheck();
      checks.database = { ok: db.ok, name: db.database, server: db.serverVersion, latencyMs: db.latencyMs };
      if (!db.ok) healthy = false;
    } catch (err) {
      healthy = false;
      checks.database = { ok: false, error: err.message };
    }

    try {
      checks.queue = { ok: true, stats: await getQueueStats() };
    } catch (err) {
      healthy = false;
      checks.queue = { ok: false, error: err.message };
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

  // Lightweight liveness probe for nginx / systemd.
  router.get('/api/v1/ping', (req, res) => {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
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