import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const mockBackend = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (req.url === '/api/v1/auth/me') {
    const authenticated = String(req.headers.cookie || '').includes('bsf_session=session-test');
    res.writeHead(authenticated ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authenticated
      ? { ok: true, data: { user: { userName: 'admin', role: 'master_admin' } } }
      : { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }));
    return;
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(body.userName, 'admin');
  res.setHeader('Set-Cookie', [
    'bsf_session=session-test; Path=/; HttpOnly; SameSite=Strict',
    'bsf_csrf=csrf-test; Path=/; SameSite=Strict'
  ]);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, data: { user: { userName: 'admin', role: 'master_admin' } } }));
});

await new Promise((resolve) => mockBackend.listen(0, '127.0.0.1', resolve));
const backendPort = mockBackend.address().port;
const frontendPort = await freePort();
const child = spawn(process.execPath, ['scripts/dev-server.mjs'], {
  cwd: appRoot,
  env: {
    ...process.env,
    PORT: String(frontendPort),
    BSF_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
    BSF_GATEWAY_URL: 'http://127.0.0.1:1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${frontendPort}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Development server did not start');
}

await waitForServer();

test.after(async () => {
  child.kill();
  await new Promise((resolve) => mockBackend.close(resolve));
});

test('frontend proxy forwards login and preserves session cookies', async () => {
  const response = await fetch(`http://127.0.0.1:${frontendPort}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `http://127.0.0.1:${frontendPort}`
    },
    body: JSON.stringify({ userName: 'admin', password: '123456' })
  });
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.some((value) => value.includes('bsf_session=session-test')));
  assert.ok(cookies.some((value) => value.includes('bsf_csrf=csrf-test')));
  const body = await response.json();
  assert.equal(body.data.user.role, 'master_admin');
});

test('gateway rejects unauthenticated clients and accepts a valid session', async () => {
  const anonymous = await fetch(`http://127.0.0.1:${frontendPort}/api/gateway/health`);
  assert.equal(anonymous.status, 401);

  const authenticated = await fetch(`http://127.0.0.1:${frontendPort}/api/gateway/health`, {
    headers: { Cookie: 'bsf_session=session-test' }
  });
  // Auth passed; the placeholder gateway target is intentionally unreachable.
  assert.equal(authenticated.status, 502);
});
