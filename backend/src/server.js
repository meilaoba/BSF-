import http from 'node:http';
import process from 'node:process';
import { config, isProduction } from './config.js';
import { closePool, healthCheck } from './db.js';
import { Router, applyCors, sendError, sendJson } from './lib/http.js';
import { AppError, UnauthorizedError } from './lib/errors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerDirectoryRoutes } from './routes/directory.js';
import { registerAuthRoutes } from './routes/auth.js';
import { hasValidApiKey } from './middleware/auth.js';
import {
  applyDataScope,
  authorizeApiPath,
  enforceCsrf,
  getSessionFromRequest,
  isPublicApiPath,
} from './middleware/session.js';

const router = new Router();
registerAuthRoutes(router);
registerHealthRoutes(router);
registerNotificationRoutes(router);
registerDirectoryRoutes(router);

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    applyCors(req, res, config.corsAllowedOrigins);

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    if (url.pathname === '/' || url.pathname === '/api' || url.pathname === '/api/v1') {
      sendJson(res, 200, {
        ok: true,
        service: 'bsf-backend',
        version: '0.1.0',
        endpoints: [
          'POST /api/v1/auth/login',
          'GET  /api/v1/auth/me',
          'POST /api/v1/auth/logout',
          'POST /api/v1/auth/refresh',
          'GET  /api/v1/health',
          'GET  /api/v1/ping',
          'GET  /api/v1/meta/providers',
          'GET  /api/v1/notifications/providers',
          'GET  /api/v1/notifications/stats',
          'GET  /api/v1/notifications/logs',
          'GET  /api/v1/notifications/jobs',
          'POST /api/v1/notifications/send',
          'POST /api/v1/notifications/test/email',
          'POST /api/v1/notifications/test/whatsapp',
          'POST /api/v1/notifications/jobs/retry',
          'POST /api/v1/notifications/process',
          'POST /api/v1/alerts/temperature',
          'GET  /api/v1/clients',
          'POST /api/v1/clients',
          'PUT  /api/v1/clients',
          'DELETE /api/v1/clients?id=',
          'GET  /api/v1/machines',
          'POST /api/v1/machines',
          'PUT  /api/v1/machines',
          'DELETE /api/v1/machines?id=',
          'GET  /api/v1/users',
          'POST /api/v1/users',
          'PUT  /api/v1/users',
          'DELETE /api/v1/users?id=',
          'GET  /api/v1/notification-recipients',
          'POST /api/v1/notification-recipients',
          'DELETE /api/v1/notification-recipients?id=',
          'GET  /api/v1/notification-preferences',
          'PUT  /api/v1/notification-preferences',
          'GET  /api/v1/alert-thresholds',
          'PUT  /api/v1/alert-thresholds',
          'GET  /api/v1/audit-logs',
        ],
      });
      return;
    }

    const isApiV1 = url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/');
    const serviceRequest = hasValidApiKey(req);
    if (isApiV1 && !isPublicApiPath(url.pathname) && !serviceRequest) {
      const session = await getSessionFromRequest(req);
      if (session) {
        req.auth = session;
        authorizeApiPath(req, url.pathname, session);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) enforceCsrf(req, session);
        applyDataScope(req, session);
      } else if (config.auth.required) {
        throw new UnauthorizedError('Authentication required');
      }
    }

    const route = router.match(req.method, url.pathname);
    if (!route) {
      return sendJson(res, 404, {
        ok: false,
        error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${url.pathname}` },
      });
    }

    await route.handler(req, res);
  } catch (err) {
    if (!(err instanceof AppError) && isProduction) {
      // Never leak internals; keep the full detail in the service log.
      console.error('[api] unhandled error:', err);
      return sendJson(res, 500, {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
    sendError(res, err);
  } finally {
    const ms = Date.now() - started;
    if (ms > 1000) {
      console.warn(`[api] slow request ${req.method} ${url.pathname} ${ms}ms`);
    }
  }
});

// Guard against slow clients holding sockets open.
server.headersTimeout = 65_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 20_000;

server.listen(config.port, config.host, () => {
  console.log(`[api] bsf-backend listening on http://${config.host}:${config.port} (${config.env})`);
  console.log(`[api] email provider: ${config.email.provider} | whatsapp provider: ${config.whatsapp.provider}`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down...`);

  server.close(async () => {
    try {
      await closePool();
    } catch (err) {
      console.error('[api] error closing pool:', err.message);
    }
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandled rejection:', reason);
});

// Startup self-check: surface a bad DATABASE_URL immediately.
healthCheck()
  .then((db) => console.log(`[api] database ok: ${db.database} (${db.latencyMs}ms)`))
  .catch((err) => {
    console.error('[api] DATABASE UNREACHABLE at startup:', err.message);
  });
