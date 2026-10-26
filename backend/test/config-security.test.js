import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const encryptionKey = Buffer.alloc(32, 7).toString('base64');

function productionEnv(overrides = {}) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
    PUBLIC_ORIGIN: 'https://bsf.example.com',
    TRUST_PROXY: 'true',
    REQUIRE_HTTPS: 'true',
    CORS_ALLOWED_ORIGINS: 'https://bsf.example.com',
    INTERNAL_API_KEY: 'a-secure-internal-key-with-32-chars',
    VENDOR_AUTH_ENABLED: 'true',
    AUTH_REQUIRED: 'true',
    AUTH_COOKIE_SECURE: 'true',
    AUTH_TOKEN_ENCRYPTION_KEY: encryptionKey,
    ...overrides,
  };
}

function loadConfig(env) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "import('./src/config.js').then(({config}) => console.log(JSON.stringify({trustProxy: config.trustProxy, requireHttps: config.requireHttps, publicOrigin: config.publicOrigin})))"],
    { cwd: backendRoot, env, encoding: 'utf8' }
  );
}

test('production configuration accepts a complete HTTPS baseline', () => {
  const result = loadConfig(productionEnv());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    trustProxy: true,
    requireHttps: true,
    publicOrigin: 'https://bsf.example.com',
  });
});

test('production configuration fails closed for insecure settings', () => {
  const cases = [
    [{ PUBLIC_ORIGIN: '' }, 'PUBLIC_ORIGIN is required'],
    [{ PUBLIC_ORIGIN: 'http://bsf.example.com' }, 'PUBLIC_ORIGIN must use HTTPS'],
    [{ HOST: '0.0.0.0' }, 'HOST must be a loopback address'],
    [{ TRUST_PROXY: 'false' }, 'TRUST_PROXY must be true'],
    [{ REQUIRE_HTTPS: 'false' }, 'REQUIRE_HTTPS must be true'],
    [{ CORS_ALLOWED_ORIGINS: '*' }, 'CORS_ALLOWED_ORIGINS must not contain *'],
    [{ CORS_ALLOWED_ORIGINS: 'http://bsf.example.com' }, 'Every CORS_ALLOWED_ORIGINS entry must use HTTPS'],
    [{ AUTH_REQUIRED: 'false' }, 'AUTH_REQUIRED must be true'],
    [{ AUTH_COOKIE_SECURE: 'false' }, 'REQUIRE_HTTPS=true requires AUTH_COOKIE_SECURE=true'],
    [{ INTERNAL_API_KEY: 'too-short' }, 'INTERNAL_API_KEY must be at least 24 characters'],
  ];

  for (const [overrides, expected] of cases) {
    const result = loadConfig(productionEnv(overrides));
    assert.notEqual(result.status, 0, `expected startup failure for ${JSON.stringify(overrides)}`);
    assert.match(result.stderr, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
