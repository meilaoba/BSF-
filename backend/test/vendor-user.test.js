import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const {
  addVendorUser,
  deleteVendorUser,
  encryptVendorUserPassword,
  findVendorUserByName,
  listAllVendorUsers,
  listVendorUsers,
  updateVendorUser,
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

test('returns the vendor rejection as a readable conflict instead of a bare 502', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    code: 4001,
    msg: '用户名已存在',
    data: null,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(
      addVendorUser({
        token: 'vendor-token',
        userName: 'duplicate',
        password: 'password',
        mobile: '+85291234567',
      }),
      (error) => {
        assert.equal(error.code, 'VENDOR_USER_ADD_REJECTED');
        assert.equal(error.status, 409);
        assert.equal(error.message, '用户名已存在');
        assert.equal(error.details.vendorCode, 4001);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('fails before a vendor call when the user-operation deadline is exhausted', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error('unexpected fetch');
  };
  try {
    await assert.rejects(
      listVendorUsers({
        token: 'vendor-token',
        userId: 8,
        deadlineAt: Date.now() - 1,
      }),
      (error) => {
        assert.equal(error.code, 'VENDOR_USER_OPERATION_TIMEOUT');
        assert.equal(error.status, 408);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(called, false);
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

test('updates only documented vendor user fields', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ code: 200, msg: '修改成功', data: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await updateVendorUser({
      token: 'vendor-token',
      id: 52,
      userName: 'new-name',
      mobile: '+85291234567',
      userState: 0,
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(calls[0].url, /\/user\/update$/);
  assert.equal(calls[0].options.headers.token, 'vendor-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    id: 52,
    userName: 'new-name',
    mobile: '+85291234567',
    userState: 0,
  });
});

test('deletes the vendor child user by vendor id', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ code: 200, msg: '删除成功', data: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await deleteVendorUser({ token: 'vendor-token', id: 52 });
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(calls[0].url, /\/user\/delete$/);
  assert.equal(calls[0].options.headers.token, 'vendor-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { id: 52 });
});

test('treats an already missing vendor user as an idempotent delete', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    code: 4002,
    msg: '删除失败',
    data: null,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const result = await deleteVendorUser({ token: 'vendor-token', id: 52 });
    assert.equal(result.alreadyDeleted, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('loads all vendor user pages without duplicate ids', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    const records = payload.pageNum === 1
      ? [
        { id: 51, userName: 'one', userState: 1, parentId: 8, userType: 3 },
        { id: 52, userName: 'two', userState: 1, parentId: 8, userType: 3 },
      ]
      : [
        { id: 52, userName: 'two', userState: 1, parentId: 8, userType: 3 },
        { id: 53, userName: 'three', userState: 1, parentId: 8, userType: 3 },
      ];
    return new Response(JSON.stringify({
      code: 200,
      data: { records, total: 3, size: 100, current: payload.pageNum, pages: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await listAllVendorUsers({
      token: 'vendor-token',
      userId: 8,
    });
    assert.deepEqual(result.records.map((record) => record.id), [51, 52, 53]);
  } finally {
    global.fetch = originalFetch;
  }
});
