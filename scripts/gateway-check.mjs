import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGatewayApi } from '../src/api/gateway.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const configPath = (typeof process !== 'undefined' && process.argv && process.argv[2]) || path.join(projectRoot, 'config.json');

function lastPortFromLog(logText) {
  const matches = [...String(logText || '').matchAll(/API listening on http:\/\/127\.0\.0\.1:(\d+)/g)];
  return matches.length ? matches[matches.length - 1][1] : '';
}

async function main() {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const logPath = path.resolve(projectRoot, (config.log && config.log.file) || 'bms_mos.log');
  let logText = '';
  try { logText = await fs.readFile(logPath, 'utf8'); } catch {}

  const port = lastPortFromLog(logText) || '11851';
  const gatewayBaseUrl = process.env.BSF_GATEWAY_URL || ('http://127.0.0.1:' + port);
  const gateway = createGatewayApi({ baseUrl: gatewayBaseUrl, timeoutMs: 5000 });

  const result = {
    configFile: configPath,
    mqtt: {
      broker: (config.mqtt && config.mqtt.broker) || '',
      topic: (config.mqtt && config.mqtt.topic) || ''
    },
    gatewayBaseUrl
  };

  try {
    const health = await gateway.health();
    const latest = await gateway.latest().catch(() => null);
    const messages = await gateway.messages(1).catch(() => null);
    result.connected = true;
    result.health = health;
    result.latest = latest && latest.empty ? null : latest;
    result.messageSampleCount = messages && Array.isArray(messages.items) ? messages.items.length : 0;
  } catch (error) {
    result.connected = false;
    result.error = error.message;
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.connected) process.exitCode = 1;
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
