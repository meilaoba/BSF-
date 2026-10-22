import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let receivedBody = null;
let receivedContentType = null;

const vendor = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  receivedContentType = req.headers['content-type'];

  if (receivedBody.userPass !== 'E10ADC3949BA59ABBE56E057F20F883E') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 401, msg: 'bad credentials' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    code: 200,
    msg: 'Request processed successfully',
    data: {
      id: 7,
      userName: 'admin',
      type: 1,
      userState: 1,
      parentId: null,
      token: 'access-token',
      refreshToken: 'refresh-token'
    }
  }));
});

await new Promise((resolve) => vendor.listen(0, '127.0.0.1', resolve));
const { port } = vendor.address();

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.VENDOR_AUTH_ENABLED = 'true';
process.env.AUTH_REQUIRED = 'false';
process.env.AUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
process.env.VENDOR_LOGIN_URL = `http://127.0.0.1:${port}/user/login`;
process.env.VENDOR_LOGIN_FORMAT = 'json';

const { loginWithVendor } = await import('../src/providers/vendor-auth.js');

test.after(() => new Promise((resolve) => vendor.close(resolve)));

test('vendor login sends uppercase MD5 and maps the role', async () => {
  const result = await loginWithVendor('admin', '123456');
  assert.equal(receivedContentType, 'application/json');
  assert.deepEqual(receivedBody, {
    userName: 'admin',
    userPass: 'E10ADC3949BA59ABBE56E057F20F883E'
  });
  assert.equal(result.vendorUser.role, 'master_admin');
  assert.equal(result.token, 'access-token');
  assert.equal(result.refreshToken, 'refresh-token');
});

test('vendor rejection becomes a generic credential error', async () => {
  await assert.rejects(
    () => loginWithVendor('admin', 'wrong-password'),
    (err) => err.code === 'INVALID_CREDENTIALS' && err.status === 401
  );
});
