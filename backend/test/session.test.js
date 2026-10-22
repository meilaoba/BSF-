import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.VENDOR_AUTH_ENABLED = 'false';
process.env.AUTH_REQUIRED = 'false';
process.env.AUTH_COOKIE_SECURE = 'false';

const { sha256Hex } = await import('../src/lib/crypto.js');
const { authCookies, authorizeApiPath, enforceCsrf, parseCookies, publicUser } = await import('../src/middleware/session.js');

test('session and CSRF cookies are HttpOnly/SameSite protected', () => {
  const cookies = authCookies('session-token', 'csrf-token', 600);
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[0], /SameSite=Strict/);
  assert.doesNotMatch(cookies[1], /HttpOnly/);
});

test('cookie parsing and CSRF validation reject a mismatched token', () => {
  const req = { headers: { cookie: 'bsf_csrf=expected' } };
  assert.equal(parseCookies(req).bsf_csrf, 'expected');
  assert.throws(
    () => enforceCsrf({ headers: { 'x-csrf-token': 'wrong' } }, { csrfHash: sha256Hex('expected') }),
    (err) => err.code === 'FORBIDDEN'
  );
  assert.doesNotThrow(
    () => enforceCsrf({ headers: { 'x-csrf-token': 'expected' } }, { csrfHash: sha256Hex('expected') })
  );
});

test('public user payload does not expose vendor tokens', () => {
  const user = publicUser({
    id: 'bf99f7e7-17f7-4f0a-98f5-0f386ee68d16',
    vendor_username: 'admin',
    full_name: 'admin',
    email: null,
    phone: null,
    role: 'master_admin',
    client_id: null,
    machine_id: null,
    vendor_type: 1,
    metadata: { vendor: { userIcon: 'https://example.test/avatar.png', parentId: null } }
  });
  assert.equal(user.role, 'master_admin');
  assert.equal(user.userName, 'admin');
  assert.equal(Object.prototype.hasOwnProperty.call(user, 'token'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(user, 'refreshToken'), false);
});

test('tenant roles cannot bypass master-only routes with a trailing slash', () => {
  const session = { user: { role: 'client_admin', clientId: 'client-id' } };
  assert.throws(
    () => authorizeApiPath({}, '/api/v1/audit-logs/', session),
    (err) => err.code === 'FORBIDDEN'
  );
});
