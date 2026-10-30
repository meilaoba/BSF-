import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';
process.env.AUTH_REQUIRED = 'false';
process.env.VENDOR_AUTH_ENABLED = 'false';

const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(wss, 'listening');
process.env.VENDOR_REALTIME_WS_URL = `ws://127.0.0.1:${wss.address().port}/ws`;

const {
  fetchVendorRealtimeDevices,
  mergeRealtimeDevices,
  normalizeRealtimeMessage,
} = await import('../src/providers/vendor-realtime.js');

test.after(() => new Promise((resolve) => wss.close(resolve)));

test('realtime records are limited to devices authorized by the REST response', () => {
  const devices = [
    { id: '52', serialNumber: 'ALLOWED-52' },
    { id: '53', serialNumber: 'ALLOWED-53' },
  ];
  const message = [
    {
      id: 52,
      deviceSerialNum: 'ALLOWED-52',
      deviceOnline: 1,
      data: {
        CabinTemp: 42.5,
        Humidity: 0.2,
        RealTimeWeight: 4.2,
        OperatingStatus: 1,
        ignoredObject: { secret: true },
        constructor: 'blocked',
      },
    },
    {
      id: 57,
      deviceSerialNum: 'FOREIGN-57',
      deviceOnline: 1,
      data: { CabinTemp: 99 },
    },
  ];

  const result = normalizeRealtimeMessage(message, devices);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '52');
  assert.equal(result[0].telemetry.CabinTemp, 42.5);
  assert.equal(result[0].telemetry.RealTimeWeight, 4.2);
  assert.equal(Object.prototype.hasOwnProperty.call(result[0].telemetry, 'ignoredObject'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result[0].telemetry, 'constructor'), false);

  const merged = mergeRealtimeDevices(devices, new Map([[result[0].id, result[0]]]));
  assert.equal(merged[0].telemetry.CabinTemp, 42.5);
  assert.equal(merged[0].realtime, true);
  assert.equal(merged[0].lastSyncedAt.length > 0, true);
  assert.equal(merged[1].telemetry, undefined);
});

test('realtime client sends the authenticated device subscription and filters foreign pushes', async () => {
  let receivedToken = null;
  let receivedSubscription = null;
  let connectionClosed = null;
  const handler = (socket, req) => {
    receivedToken = new URL(req.url, 'http://localhost').searchParams.get('token');
    connectionClosed = once(socket, 'close');
    socket.on('message', (raw) => {
      receivedSubscription = JSON.parse(raw.toString('utf8'));
      socket.send(JSON.stringify([
        {
          id: 52,
          deviceSerialNum: 'ALLOWED-52',
          deviceOnline: 1,
          data: { CabinTemp: 46.9, Humidity: 0.2, OperatingStatus: 2 },
        },
        {
          id: 57,
          deviceSerialNum: 'FOREIGN-57',
          deviceOnline: 1,
          data: { CabinTemp: 27.5 },
        },
      ]));
    });
  };
  wss.on('connection', handler);

  try {
    const live = await fetchVendorRealtimeDevices({
      token: 'test-vendor-token',
      devices: [{ id: '52', serialNumber: 'ALLOWED-52' }],
      timeoutMs: 2000,
    });

    assert.equal(receivedToken, 'test-vendor-token');
    assert.deepEqual(receivedSubscription, { deviceId: '52' });
    assert.equal(live.size, 1);
    assert.equal(live.get('52').telemetry.CabinTemp, 46.9);
    await Promise.race([
      connectionClosed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('realtime socket did not close')), 1000)),
    ]);
  } finally {
    wss.off('connection', handler);
  }
});
