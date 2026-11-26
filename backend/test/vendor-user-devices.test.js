import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const {
  listVendorUserAssignments,
  replaceVendorUserAssignments,
} = await import('../src/providers/vendor-user-devices.js');

test('loads assigned and unassigned devices for a vendor child user', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      code: 200,
      msg: 'Request processed successfully',
      data: {
        assignedList: [{ id: 30, deviceName: 'A', deviceSerialNum: 'SN-A', fromUserId: 8 }],
        unassignedList: [{ id: 31, deviceName: 'B', deviceSerialNum: 'SN-B', userId: 8 }],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await listVendorUserAssignments({ token: 'vendor-token', userId: 52 });
    assert.equal(result.assignedList[0].id, 30);
    assert.equal(result.unassignedList[0].id, 31);
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(calls[0].url, /\/emDeviceAssign\/assignedUser$/);
  assert.equal(calls[0].options.headers.token, 'vendor-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { userId: 52 });
});

test('replaces assignments with the complete retained device set', async () => {
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
    await replaceVendorUserAssignments({
      token: 'vendor-token',
      userId: 52,
      fromUserId: 8,
      deviceIds: [30, 32, 32],
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(calls[0].url, /\/emDeviceAssign\/allocateEquipment$/);
  assert.equal(calls[0].options.headers.token, 'vendor-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    deviceId: [30, 32],
    userIdList: 52,
    fromUserId: 8,
  });
});

test('accepts an empty retained set for clearing all assignments', async () => {
  const originalFetch = global.fetch;
  let payload;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ code: 200, msg: '添加成功', data: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await replaceVendorUserAssignments({
      token: 'vendor-token',
      userId: 52,
      fromUserId: 8,
      deviceIds: [],
    });
  } finally {
    global.fetch = originalFetch;
  }
  assert.deepEqual(payload.deviceId, []);
});
