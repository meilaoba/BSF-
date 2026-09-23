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
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function proxyGateway(req, res, incomingUrl) {
  const targetPath = incomingUrl.pathname.replace(/^\/api\/gateway/, '/api') + incomingUrl.search;
  const target = new URL(targetPath, gatewayUrl);
  const client = target.protocol === 'https:' ? https : http;
  const proxyReq = client.request(target, {
    method: req.method,
    headers: Object.assign({}, req.headers, { host: target.host })
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
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
