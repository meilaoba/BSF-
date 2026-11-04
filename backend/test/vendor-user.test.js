import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const {
  addVendorUser,
  encryptVendorUserPassword,
} = await import('../src/providers/vendor-user.js');

test('encrypts the documented vendor user password sample', () => {
  assert.equal(encryptVendorUserPassword('ress123'), 'vP72AWz5ArJoimzICnZgIQ==');
});

test('creates a vendor user with the required token header and payload', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ code: 200, msg: '添加成功', data: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await addVendorUser({
      token: 'vendor-token',
      userName: 'ress',
      password: 'ress123',
      mobile: '1111111',
      status: 1,
    });
    assert.equal(result.message, '添加成功');
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/user\/add$/);
  assert.equal(calls[0].options.headers.token, 'vendor-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    userName: 'ress',
    userPass: 'vP72AWz5ArJoimzICnZgIQ==',
    mobile: '1111111',
    userIcon: '',
    status: 1,
  });
});
