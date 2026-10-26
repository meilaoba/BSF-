import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const workspaceRoot = path.resolve(appRoot, '..');
const port = Number(process.env.PORT || 4180);
const host = process.env.HOST || (process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1');

function lastPortFromLog(logText) {
  const matches = [...String(logText || '').matchAll(/API listening on http:\/\/127\.0\.0\.1:(\d+)/g)];
  return matches.length ? matches[matches.length - 1][1] : '11851';
}

function resolveGatewayUrl() {
  const arg = process.argv.find((value) => value.startsWith('--gateway='));
  if (arg) return arg.slice('--gateway='.length).replace(/\/+$/, '');
  if (process.env.BSF_GATEWAY_URL) return process.env.BSF_GATEWAY_URL.replace(/\/+$/, '');
  let logText = '';
  try { logText = fs.readFileSync([path.join(appRoot, 'bms_mos.log'), path.join(workspaceRoot, 'bms_mos.log')].find((candidate) => fs.existsSync(candidate)) || path.join(workspaceRoot, 'bms_mos.log'), 'utf8'); } catch {}
  return 'http://127.0.0.1:' + lastPortFromLog(logText);
}

const gatewayUrl = resolveGatewayUrl();
const backendUrl = String(process.env.BSF_BACKEND_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const gatewayAuthRequired = process.env.BSF_GATEWAY_AUTH_REQUIRED !== 'false';
const trustProxy = process.env.BSF_TRUST_PROXY === 'true';

const gatewayRateLimit = new Map();
const GATEWAY_RATE_WINDOW_MS = 60 * 1000;
const GATEWAY_RATE_MAX = 120;

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' http://127.0.0.1:* http://localhost:* https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self' blob:",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none'
  };
}

function isGatewayRateLimited(req) {
  const now = Date.now();
  const ip = req.socket.remoteAddress || 'unknown';
  const current = gatewayRateLimit.get(ip) || { start: now, count: 0 };
  if (now - current.start > GATEWAY_RATE_WINDOW_MS) {
    current.start = now;
    current.count = 0;
  }
  current.count += 1;
  gatewayRateLimit.set(ip, current);
  return current.count > GATEWAY_RATE_MAX;
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function sendFile(res, filePath) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, Object.assign({ 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, securityHeaders()));
    fs.createReadStream(filePath).pipe(res);
  });
}

async function hasBackendSession(req) {
  if (!gatewayAuthRequired) return { allowed: true };
  const target = new URL('/api/v1/auth/me', backendUrl);
  const remoteAddress = req.socket?.remoteAddress || '';
  const forwardedProto = trustProxy
    ? String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
    : 'http';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(target, {
      headers: {
        cookie: req.headers.cookie || '',
        origin: req.headers.origin || (forwardedProto + '://' + (req.headers.host || '127.0.0.1')),
        'x-real-ip': remoteAddress,
        'x-forwarded-for': remoteAddress,
        'x-forwarded-proto': forwardedProto
      },
      signal: controller.signal
    });
    return response.ok ? { allowed: true } : { allowed: false, status: 401 };
  } catch {
    return { allowed: false, status: 503 };
  } finally {
    clearTimeout(timer);
  }
}

async function proxyGateway(req, res, incomingUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, securityHeaders()));
    res.end(JSON.stringify({ code: 405, message: 'Method Not Allowed', data: null }));
    return;
  }
  const authorization = await hasBackendSession(req);
  if (!authorization.allowed) {
    res.writeHead(authorization.status || 401, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, securityHeaders()));
    res.end(JSON.stringify({
      ok: false,
      error: {
        code: authorization.status === 503 ? 'AUTH_SERVICE_UNAVAILABLE' : 'UNAUTHORIZED',
        message: authorization.status === 503 ? 'Authentication service is unavailable' : 'Authentication required'
      }
    }));
    return;
  }
  if (isGatewayRateLimited(req)) {
    res.writeHead(429, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, securityHeaders()));
    res.end(JSON.stringify({ code: 429, message: 'Too Many Requests', data: null }));
    return;
  }
  const targetPath = incomingUrl.pathname.replace(/^\/api\/gateway/, '/api') + incomingUrl.search;
  const target = new URL(targetPath, gatewayUrl);
  const client = target.protocol === 'https:' ? https : http;
  const proxyReq = client.request(target, {
    method: req.method,
    headers: Object.assign({ accept: req.headers.accept || 'application/json' }, { host: target.host }),
    timeout: 15000
  }, (proxyRes) => {
    const headers = Object.assign({}, proxyRes.headers, securityHeaders());
    res.writeHead(proxyRes.statusCode || 502, headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('timeout', () => proxyReq.destroy(new Error('Gateway timeout')));
  proxyReq.on('error', (error) => {
    if (res.headersSent) return;
    res.writeHead(502, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, securityHeaders()));
    res.end(JSON.stringify({ code: 502, message: error.message, data: null }));
  });
  req.pipe(proxyReq);
}

function proxyBackend(req, res, incomingUrl) {
  const target = new URL(incomingUrl.pathname + incomingUrl.search, backendUrl);
  const client = target.protocol === 'https:' ? https : http;
  const remoteAddress = req.socket?.remoteAddress || '';
  const forwardedProto = trustProxy
    ? String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
    : 'http';
  const proxyReq = client.request(target, {
    method: req.method,
    headers: Object.assign({}, req.headers, {
      host: target.host,
      origin: req.headers.origin || (forwardedProto + '://' + (req.headers.host || '127.0.0.1')),
      'x-real-ip': remoteAddress,
      'x-forwarded-for': remoteAddress,
      'x-forwarded-proto': forwardedProto
    }),
    timeout: 15000
  }, (proxyRes) => {
    const headers = Object.assign({}, proxyRes.headers, securityHeaders());
    res.writeHead(proxyRes.statusCode || 502, headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('timeout', () => proxyReq.destroy(new Error('Backend timeout')));
  proxyReq.on('error', () => {
    if (res.headersSent) return;
    res.writeHead(502, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, securityHeaders()));
    res.end(JSON.stringify({ ok:false, error:{ code:'BACKEND_UNAVAILABLE', message:'Backend service is unavailable' } }));
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const incomingUrl = new URL(req.url || '/', 'http://127.0.0.1');
  if (incomingUrl.pathname.startsWith('/api/gateway/')) {
    proxyGateway(req, res, incomingUrl).catch(() => {
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error:{ code:'AUTH_SERVICE_UNAVAILABLE', message:'Authentication service is unavailable' } }));
    });
    return;
  }
  if (incomingUrl.pathname === '/api/v1' || incomingUrl.pathname.startsWith('/api/v1/')) {
    proxyBackend(req, res, incomingUrl);
    return;
  }

  const relative = incomingUrl.pathname === '/' ? '/index.html' : incomingUrl.pathname;
  const filePath = path.resolve(appRoot, '.' + relative);
  if (!filePath.startsWith(appRoot + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  sendFile(res, filePath);
});

server.listen(port, host, () => {
  console.log('BSF delivery server: http://' + host + ':' + port);
  console.log('Gateway proxy: http://' + host + ':' + port + '/api/gateway -> ' + gatewayUrl);
  console.log('Gateway authentication: ' + (gatewayAuthRequired ? 'required' : 'disabled'));
  console.log('Backend proxy: http://' + host + ':' + port + '/api/v1 -> ' + backendUrl);
});
