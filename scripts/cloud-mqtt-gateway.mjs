import http from 'node:http';
import mqtt from 'mqtt';

const PORT = Number(process.env.MQTT_API_PORT || 11851);
const BROKER = process.env.MQTT_BROKER || '';
const TOPIC = process.env.MQTT_TOPIC || '';
const USERNAME = process.env.MQTT_USERNAME || '';
const PASSWORD = process.env.MQTT_PASSWORD || '';
const MAX_RECORDS = 2048;

if (!BROKER || !TOPIC || !USERNAME || !PASSWORD) {
  console.error('Missing MQTT configuration. Check /etc/bsf-mqtt.env');
  process.exit(1);
}

let connected = false;
let lastError = '';
let lastMessageAt = null;
const records = [];

function reply(res, status, code, message, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify({ code, message, data }));
}

const client = mqtt.connect(BROKER, {
  username: USERNAME,
  password: PASSWORD,
  clientId: 'bsf-cloud-' + Math.random().toString(16).slice(2, 10),
  clean: true,
  connectTimeout: 10000,
  reconnectPeriod: 5000,
  keepalive: 30
});

client.on('connect', () => {
  connected = true;
  lastError = '';
  console.log('[MQTT] Connected to broker');

  client.subscribe(TOPIC, { qos: 1 }, (err) => {
    if (err) {
      lastError = err.message;
      console.error('[MQTT] Subscribe failed:', err.message);
    } else {
      console.log('[MQTT] Subscribed to configured topic');
    }
  });
});

client.on('reconnect', () => {
  connected = false;
  console.log('[MQTT] Reconnecting...');
});

client.on('close', () => {
  connected = false;
});

client.on('error', (err) => {
  lastError = err.message;
  console.error('[MQTT] Error:', err.message);
});

client.on('message', (_topic, buffer) => {
  try {
    let message = JSON.parse(buffer.toString('utf8'));

    // Support either a raw device message or the documented API wrapper.
    if (message && message.code === 0 && message.data) {
      message = message.data;
    }

    if (!message || !Array.isArray(message.devices)) {
      console.warn('[MQTT] Ignored message with unexpected format');
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (!message.timestamp) message.timestamp = now;
    message.receivedAt = now;

    records.unshift(message);
    if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;

    lastMessageAt = now;
    console.log('[MQTT] Device message received; cached:', records.length);
  } catch {
    console.warn('[MQTT] Ignored non-JSON message');
  }
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');

  if (req.method !== 'GET') {
    return reply(res, 405, 405, 'Method Not Allowed', null);
  }

  if (url.pathname === '/api/health') {
    return reply(res, 200, 0, 'ok', {
      status: connected ? 'up' : 'down',
      mqttConnected: connected,
      topicConfigured: Boolean(TOPIC),
      cachedRecords: records.length,
      lastMessageAt,
      error: lastError || null
    });
  }

  if (url.pathname === '/api/latest') {
    return reply(res, 200, 0, 'ok', records[0] || { empty: true });
  }

  if (url.pathname === '/api/messages') {
    const requested = Number.parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 50, MAX_RECORDS));
    return reply(res, 200, 0, 'ok', { items: records.slice(0, limit) });
  }

  return reply(res, 404, 404, 'Not Found', null);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[API] Listening on 127.0.0.1:' + PORT);
});
