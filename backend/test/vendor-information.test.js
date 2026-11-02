import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = [];
const vendor = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  requests.push({ url: req.url, method: req.method, token: req.headers.token, body });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (req.url === '/emTemplate/list') {
    res.end(JSON.stringify({
      code: 200,
      data: {
        total: 1,
        current: 1,
        size: 20,
        pages: 1,
        records: [{
          id: 38,
          templateName: 'Siemens_GAIZAO_300',
          templateLocation: [{
            id: 382,
            templateKeyName: 'SingleAddMaterial',
            templateType: 5,
            templateIsChange: 0,
            templateUnit: 'kg',
            templateIcon: 14,
            templateCustomize: [{ color: 'red', value: 0, instrucy: 'Stop' }],
            templateId: 38,
            templateShow: 2,
            path: 'https://example.test/icon.png',
            sensorName: 'Single Feeding',
            templateSort: 1,
          }],
        }],
      },
    }));
    return;
  }
  if (req.url === '/historyData/deviceList') {
    res.end(JSON.stringify({
      code: 200,
      data: {
        total: 1,
        pageNum: 1,
        pageSize: 20,
        totalPages: 1,
        records: [{
          deviceSerialNum: '365702012631B883',
          deviceName: 'CR-30S_QX2026124',
          statDate: '2026-10-16',
          runTime: 1,
          saveCarbon: 0,
          kitchenWaste: 0,
          powerConsume: 1.5,
          deviceLocation: '2',
          unloadingWeight: 0,
          bindingTime: 1789386531140,
        }],
      },
    }));
    return;
  }
  res.writeHead(404);
  res.end('{}');
});

await new Promise((resolve) => vendor.listen(0, '127.0.0.1', resolve));
const { port } = vendor.address();

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.VENDOR_TEMPLATE_LIST_URL = `http://127.0.0.1:${port}/emTemplate/list`;
process.env.VENDOR_DAILY_STATS_URL = `http://127.0.0.1:${port}/historyData/deviceList`;

const { fetchVendorTemplates } = await import('../src/providers/vendor-templates.js');
const {
  fetchAllVendorDailyStats,
  fetchVendorDailyStats,
} = await import('../src/providers/vendor-daily-stats.js');

test.after(() => new Promise((resolve) => vendor.close(resolve)));

test('template list maps vendor field dictionary and uses token header', async () => {
  const result = await fetchVendorTemplates({ token: 'access-token', pageNum: 1, pageSize: 20 });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].token, 'access-token');
  assert.deepEqual(requests[0].body, { pageNum: '1', pageSize: '20' });
  assert.equal(result.records[0].templateName, 'Siemens_GAIZAO_300');
  assert.equal(result.records[0].points[0].keyName, 'SingleAddMaterial');
  assert.equal(result.records[0].points[0].showType, 2);
  assert.equal(result.pagination.total, 1);
});

test('daily stats map all device-day reporting fields without changing units', async () => {
  const result = await fetchVendorDailyStats({
    token: 'access-token',
    deviceName: 'CR-30S_QX2026124',
    pageNum: 1,
    pageSize: 20,
  });
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].token, 'access-token');
  assert.deepEqual(requests[1].body, {
    startTime: '',
    endTime: '',
    deviceName: 'CR-30S_QX2026124',
    pageSize: 20,
    pageNum: 1,
  });
  assert.deepEqual(result.records[0], {
    deviceSerialNumber: '365702012631B883',
    deviceName: 'CR-30S_QX2026124',
    statDate: '2026-10-16',
    runTime: 1,
    vendorSavedCarbon: 0,
    kitchenWaste: 0,
    powerConsume: 1.5,
    deviceLocation: '2',
    unloadingWeight: 0,
    bindingTime: 1789386531140,
  });
  assert.equal(result.pagination.totalPages, 1);
});

test('daily stats helper follows all pagination pages', async () => {
  const records = await fetchAllVendorDailyStats({
    token: 'access-token',
    deviceName: 'CR-30S_QX2026124',
    pageSize: 100,
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].statDate, '2026-10-16');
});
