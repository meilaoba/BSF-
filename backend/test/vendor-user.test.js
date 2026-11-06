import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const {
  addVendorUser,
  encryptVendorUserPassword,
  findVendorUserByName,
  listVendorUsers,
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

test('lists vendor child users without exposing encrypted passwords', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      code: 200,
      msg: 'Request processed successfully',
      data: {
        records: [{
          id: 52,
          userName: 'TT',
          userPass: 'secret-ciphertext',
          mobile: '68824663',
          userState: 1,
          parentId: 8,
          userType: 2,
          createTime: 1769569451050,
          updateTime: null,
          email: null,
          userIcon: '',
        }],
        total: 1,
        size: 100,
        current: 1,
        pages: 1,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await listVendorUsers({
      token: 'vendor-token',
      userId: 8,
      userName: 'TT',
      pageNum: 1,
      pageSize: 100,
    });
    assert.equal(result.records[0].id, 52);
    assert.equal(result.records[0].userName, 'TT');
    assert.equal(result.records[0].userPass, undefined);
    assert.equal(result.pagination.total, 1);
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(calls[0].url, /\/user\/list$/);
  assert.equal(calls[0].options.headers.token, 'vendor-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    userName: 'TT',
    userId: 8,
    pageSize: 100,
    pageNum: 1,
  });
});

test('finds an existing vendor child user by exact user name', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    code: 200,
    data: {
      records: [
        { id: 51, userName: 'TT-old', userType: 2 },
        { id: 52, userName: 'tt', userType: 3 },
      ],
      total: 2,
      size: 100,
      current: 1,
      pages: 1,
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const result = await findVendorUserByName({
      token: 'vendor-token',
      userId: 8,
      userName: 'TT',
    });
    assert.equal(result.id, 52);
    assert.equal(result.userType, 3);
  } finally {
    global.fetch = originalFetch;
  }
});
