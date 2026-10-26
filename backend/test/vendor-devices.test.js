import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let lastRequest = null;

const vendor = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  lastRequest = {
    method: req.method,
    headers: req.headers,
    body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
  };

  if (req.headers.token === 'expired-token') {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 401, msg: 'expired' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    code: 200,
    msg: 'Request processed successfully',
    data: {
      current: 1,
      total: 2,
      pages: 1,
      pageSize: 10,
      records: [
        {
          id: 25,
          createTime: 1769581209972,
          deviceAddress: '2',
          deviceImage: 'javascript:alert(1)',
          deviceLatitude: 22.320778,
          deviceLongitude: 114.256289,
          deviceName: '  Metro City  ',
          deviceOnline: 2,
          devicePower: 9,
          deviceSerialNum: '365706012552AB5E',
          deviceType: 20,
          templateName: 'Siemens_YSFL_WSB_CL_FX',
          userId: 1,
          userName: 'admin',
          data: { TotalAddMaterial: 6.053, OtalUnloadingWeight: -3.2 },
        },
        {
          id: 26,
          deviceName: 'Tai Wai Village',
          deviceOnline: 0,
          deviceSerialNum: '365706012552AB60',
          data: null,
        },
      ],
    },
  }));
});

await new Promise((resolve) => vendor.listen(0, '127.0.0.1', resolve));
const { port } = vendor.address();

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.VENDOR_AUTH_ENABLED = 'true';
process.env.AUTH_REQUIRED = 'false';
process.env.AUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');
process.env.VENDOR_DEVICE_LIST_URL = `http://127.0.0.1:${port}/emDevice/queryListData`;

const { listVendorDevices } = await import('../src/providers/vendor-devices.js');

test.after(() => new Promise((resolve) => vendor.close(resolve)));

test('vendor device list uses the signed vendor token and normalized fields', async () => {
  const result = await listVendorDevices({
    token: 'access-token',
    pageNum: 1,
    pageSize: 10,
    equipName: 'Metro',
    deviceAddress: '2',
    deviceOnline: 2,
  });

  assert.equal(lastRequest.method, 'POST');
  assert.equal(lastRequest.headers.token, 'access-token');
  assert.equal(lastRequest.headers.authorization, undefined);
  assert.deepEqual(lastRequest.body, {
    pageSize: '10',
    pageNum: '1',
    equipName: 'Metro',
    deviceAddress: '2',
    deviceOnline: 2,
  });

  assert.deepEqual(result.pagination, { current: 1, total: 2, pages: 1, pageSize: 10 });
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].id, '25');
  assert.equal(result.records[0].deviceName, 'Metro City');
  assert.equal(result.records[0].serialNumber, '365706012552AB5E');
  assert.equal(result.records[0].onlineCode, 2);
  assert.equal(result.records[0].latitude, 22.320778);
  assert.equal(result.records[0].imageUrl, null);
  assert.deepEqual(result.records[0].telemetry, {
    TotalAddMaterial: 6.053,
    OtalUnloadingWeight: -3.2,
  });
  assert.equal(result.records[1].telemetry, null);
});

test('expired vendor token is reported as a session expiry', async () => {
  await assert.rejects(
    () => listVendorDevices({ token: 'expired-token', pageNum: 1, pageSize: 10 }),
    (err) => err.code === 'VENDOR_SESSION_EXPIRED' && err.status === 401
  );
});

test('invalid pagination fails before calling the vendor', async () => {
  const previous = lastRequest;
  await assert.rejects(
    () => listVendorDevices({ token: 'access-token', pageNum: 1, pageSize: 101 }),
    (err) => err.code === 'VALIDATION_ERROR' && err.status === 422
  );
  assert.equal(lastRequest, previous);
});
