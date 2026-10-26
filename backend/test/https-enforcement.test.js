import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('production server rejects plain HTTP and accepts trusted HTTPS proxy requests', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
      PUBLIC_ORIGIN: 'https://bsf.example.com',
      TRUST_PROXY: 'true',
      REQUIRE_HTTPS: 'true',
      CORS_ALLOWED_ORIGINS: 'https://bsf.example.com',
      INTERNAL_API_KEY: 'a-secure-internal-key-with-32-chars',
      VENDOR_AUTH_ENABLED: 'true',
      AUTH_REQUIRED: 'true',
      AUTH_COOKIE_SECURE: 'true',
      AUTH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/ping`);
        if (response.status === 426) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, 'server did not start with HTTPS enforcement');

    const plain = await fetch(`http://127.0.0.1:${port}/api/v1/ping`);
    assert.equal(plain.status, 426);
    assert.equal((await plain.json()).error.code, 'HTTPS_REQUIRED');

    const proxied = await fetch(`http://127.0.0.1:${port}/api/v1/ping`, {
      headers: {
        'X-Forwarded-Proto': 'https',
        'X-Real-IP': '203.0.113.10',
      },
    });
    assert.equal(proxied.status, 200);
    assert.equal((await proxied.json()).ok, true);
  } finally {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 2000);
    });
  }
});
