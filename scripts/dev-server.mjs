import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const port = Number(process.env.PORT || 4180);
const host = process.env.HOST || (process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1');
const backendUrl = String(process.env.BSF_BACKEND_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const trustProxy = process.env.BSF_TRUST_PROXY === 'true';

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
    timeout: 30000
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
  console.log('Backend proxy: http://' + host + ':' + port + '/api/v1 -> ' + backendUrl);
});
