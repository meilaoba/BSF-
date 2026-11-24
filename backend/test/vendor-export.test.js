import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let lastUrl = '';
const workbookBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x78, 0x6c, 0x73, 0x78]);

const vendor = http.createServer((req, res) => {
  lastUrl = req.url || '';
  if (lastUrl.includes('deviceName=Empty')) {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="Empty.xlsx"',
    });
    res.end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="DeviceData_20261124.xlsx"',
    'Content-Length': workbookBytes.length,
  });
  res.end(workbookBytes);
});

await new Promise((resolve) => vendor.listen(0, '127.0.0.1', resolve));
const { port } = vendor.address();
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.VENDOR_EXPORT_TABLE_URL = `http://127.0.0.1:${port}/export/table`;
process.env.VENDOR_EXPORT_FAULT_URL = `http://127.0.0.1:${port}/export/emFault`;

const { fetchVendorExport } = await import('../src/providers/vendor-export.js');
const { closePool } = await import('../src/db.js');
const { matchingDevice } = await import('../src/routes/exports.js');

test.after(async () => {
  await new Promise((resolve) => vendor.close(resolve));
  await closePool();
});

test('device export forwards exact device and inclusive report dates to the vendor', async () => {
  const file = await fetchVendorExport({
    kind: 'device-data',
    token: 'secret-token',
    deviceName: 'CR-50S_QX2026059',
    deviceSerialNum: '365701012616B60D',
    startTime: '2026-11-01',
    endTime: '2026-12-01',
  });
  assert.equal(file.filename, 'DeviceData_20261124.xlsx');
  assert.deepEqual(file.bytes, workbookBytes);
  const url = new URL(lastUrl, 'http://localhost');
  assert.equal(url.pathname, '/export/table');
  assert.equal(url.searchParams.get('token'), 'secret-token');
  assert.equal(url.searchParams.get('deviceName'), 'CR-50S_QX2026059');
  assert.equal(url.searchParams.get('deviceSerialNum'), '365701012616B60D');
  assert.equal(url.searchParams.get('startTime'), '2026-11-01');
  assert.equal(url.searchParams.get('endTime'), '2026-12-01');
});

test('vendor exports reject missing device names and empty 200 responses', async () => {
  await assert.rejects(
    () => fetchVendorExport({ kind: 'device-data', token: 'secret-token' }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  await assert.rejects(
    () => fetchVendorExport({ kind: 'device-data', token: 'secret-token', deviceName: 'Empty' }),
    (error) => error.code === 'VENDOR_EXPORT_EMPTY'
  );
});

test('export device matching accepts locally resolved vendor device ids', () => {
  const records = [
    { id: '51', serialNumber: 'SERIAL-51', deviceName: 'CR-60D_051' },
    { id: '52', serialNumber: 'SERIAL-52', deviceName: 'CR-30S_052' },
  ];
  const localMachineId = 'dbbf0c56-51df-4dbf-9540-45d294d9d9b9';

  assert.equal(matchingDevice(records, localMachineId), null);
  assert.equal(
    matchingDevice(records, localMachineId, ['52'])?.deviceName,
    'CR-30S_052'
  );
});
