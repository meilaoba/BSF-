import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const workspaceRoot = path.resolve(appRoot, '..');
const port = Number(process.env.PORT || 4180);

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
    'Cross-Origin-Resource-Policy': 'same-origin'
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

function proxyGateway(req, res, incomingUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, securityHeaders()));
    res.end(JSON.stringify({ code: 405, message: 'Method Not Allowed', data: null }));
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

const server = http.createServer((req, res) => {
  const incomingUrl = new URL(req.url || '/', 'http://127.0.0.1');
  if (incomingUrl.pathname.startsWith('/api/gateway/')) {
    proxyGateway(req, res, incomingUrl);
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

server.listen(port, '127.0.0.1', () => {
  console.log('BSF delivery server: http://127.0.0.1:' + port);
  console.log('Gateway proxy: http://127.0.0.1:' + port + '/api/gateway -> ' + gatewayUrl);
});
