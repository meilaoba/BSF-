import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = [];
const vendor = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  requests.push({
    method: req.method,
    token: req.headers.token,
    body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    code: 200,
    data: {
      time: ['2026-01-01 00:00', '2026-01-01 00:30', '2026-01-02 01:00'],
      temperature: [20, 22, 24],
      humidity: [40, 44, 48],
    },
  }));
});

await new Promise((resolve) => vendor.listen(0, '127.0.0.1', resolve));
const { port } = vendor.address();
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.VENDOR_AUTH_ENABLED = 'false';
process.env.AUTH_REQUIRED = 'false';
process.env.VENDOR_HISTORY_URL = `http://127.0.0.1:${port}/historyData/temperatureHumidityCurve`;

const {
  aggregateHistoryRows,
  chunkHistoryRange,
  fetchVendorHistory,
  normalizeHistoryResponse,
  validateHistoryRange,
} = await import('../src/providers/vendor-history.js');

test.after(() => new Promise((resolve) => vendor.close(resolve)));

test('history ranges enforce valid dates and the 366 day safety limit', () => {
  assert.deepEqual(validateHistoryRange('2026-01-01', '2026-01-31'), {
    start: '2026-01-01',
    end: '2026-01-31',
    span: 30,
  });
  assert.throws(
    () => validateHistoryRange('2026-02-01', '2026-01-01'),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.throws(
    () => validateHistoryRange('2024-01-01', '2025-01-02'),
    (error) => error.code === 'VALIDATION_ERROR' && /366 days/.test(error.message)
  );
  assert.throws(
    () => validateHistoryRange('2026-02-30', '2026-03-01'),
    (error) => error.code === 'VALIDATION_ERROR'
  );
});

test('history ranges are automatically split into vendor-safe 30 day chunks', () => {
  assert.deepEqual(chunkHistoryRange('2026-01-01', '2026-02-04'), [
    { start: '2026-01-01', end: '2026-01-30' },
    { start: '2026-01-31', end: '2026-02-04' },
  ]);
});

test('vendor history arrays are normalized without inventing missing values', () => {
  const rows = normalizeHistoryResponse({
    code: 200,
    data: {
      time: ['2026-01-01 00:00', '2026-01-01 00:30', 'bad-time'],
      temperature: [20, null, 99],
      humidity: [40, 45, 50],
    },
  });
  assert.deepEqual(rows, [
    { recordedAt: '2026-01-01 00:00', temperature: 20, humidity: 40 },
    { recordedAt: '2026-01-01 00:30', temperature: null, humidity: 45 },
  ]);
});

test('history aggregation produces hourly, daily and monthly averages', () => {
  const rows = [
    { recordedAt: '2026-01-01 00:00', temperature: 10, humidity: 20 },
    { recordedAt: '2026-01-01 00:30', temperature: 20, humidity: 40 },
    { recordedAt: '2026-01-02 01:00', temperature: 30, humidity: 60 },
  ];
  assert.deepEqual(aggregateHistoryRows(rows, 'hour'), [
    { recordedAt: '2026-01-01 00:00', temperature: 15, humidity: 30 },
    { recordedAt: '2026-01-02 01:00', temperature: 30, humidity: 60 },
  ]);
  assert.deepEqual(aggregateHistoryRows(rows, 'day'), [
    { recordedAt: '2026-01-01', temperature: 15, humidity: 30 },
    { recordedAt: '2026-01-02', temperature: 30, humidity: 60 },
  ]);
  assert.deepEqual(aggregateHistoryRows(rows, 'month'), [
    { recordedAt: '2026-01', temperature: 20, humidity: 40 },
  ]);
});

test('vendor history requests are chunked, authenticated server-side and deduplicated', async () => {
  requests.length = 0;
  const rows = await fetchVendorHistory({
    token: 'vendor-access-token',
    deviceSerialNum: 'SERIAL-52',
    start: '2026-01-01',
    end: '2026-02-04',
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].token, 'vendor-access-token');
  assert.equal(requests[0].body.deviceSerialNum, 'SERIAL-52');
  assert.deepEqual(requests.map((item) => item.body.startTime).sort(), ['2026-01-01', '2026-01-31']);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].temperature, 22);
});