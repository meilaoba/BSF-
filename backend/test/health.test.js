import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.VENDOR_AUTH_ENABLED = 'false';
process.env.AUTH_REQUIRED = 'false';
process.env.AUTH_COOKIE_SECURE = 'false';

const { publicHealthPayload } = await import('../src/routes/health.js');

test('public health payload exposes only status and time', () => {
  const instant = new Date('2026-10-26T00:00:00.000Z');
  assert.deepEqual(publicHealthPayload(true, instant), {
    ok: true,
    time: '2026-10-26T00:00:00.000Z',
  });
  assert.deepEqual(publicHealthPayload(false, instant), {
    ok: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' },
    time: '2026-10-26T00:00:00.000Z',
  });
});
