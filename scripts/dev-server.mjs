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

const publicFilePaths = new Set([
  '/index.html',
  '/src/main.js',
  '/src/app.js'
]);
const publicDirectoryPrefixes = [
  '/src/api/',
  '/src/config/',
  '/src/services/',
  '/src/shared/',
  '/src/styles/',
  '/src/ui/',
  '/src/utils/',
  '/src/vendor/'
];
const publicExtensions = new Set([
  '.css', '.gif', '.html', '.ico', '.jpeg', '.jpg', '.js', '.png',
  '.svg', '.webp', '.woff', '.woff2'
]);

function securityHeaders() {
  const googleMapsSources = 'https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com';
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: " + googleMapsSources + "; connect-src 'self' http://127.0.0.1:* http://localhost:* https://maps.googleapis.com https://maps.gstatic.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self' blob:",
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
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};


function sendStaticError(res, status, message, method) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, securityHeaders()));
  if (method === 'HEAD') res.end();
  else res.end(message);
}

function sendFile(res, filePath, method) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      sendStaticError(res, 404, 'Not found', method);
      return;
    }
    const headers = Object.assign({
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store'
    }, securityHeaders());
    res.writeHead(200, headers);
    if (method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

function resolvePublicPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\')) return null;
  if (path.posix.normalize(decoded) !== decoded) return null;
  if (decoded.split('/').some((segment) => segment.startsWith('.') && segment !== '')) return null;
  if (decoded === '/') decoded = '/index.html';
  if (!publicFilePaths.has(decoded) && !publicDirectoryPrefixes.some((prefix) => decoded.startsWith(prefix))) return null;
  if (!publicExtensions.has(path.extname(decoded).toLowerCase())) return null;
  return decoded;
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

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendStaticError(res, 405, 'Method not allowed', req.method);
    return;
  }

  const publicPath = resolvePublicPath(incomingUrl.pathname);
  if (!publicPath) {
    sendStaticError(res, 404, 'Not found', req.method);
    return;
  }

  const filePath = path.resolve(appRoot, '.' + publicPath);
  if (!filePath.startsWith(appRoot + path.sep)) {
    sendStaticError(res, 404, 'Not found', req.method);
    return;
  }
  sendFile(res, filePath, req.method);
});

server.listen(port, host, () => {
  console.log('BSF delivery server: http://' + host + ':' + port);
  console.log('Backend proxy: http://' + host + ':' + port + '/api/v1 -> ' + backendUrl);
});