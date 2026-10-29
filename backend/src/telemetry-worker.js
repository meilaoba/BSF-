import process from 'node:process';
import { config } from './config.js';
import { closePool } from './db.js';
import { runCollectorTick } from './services/vendor-collector.js';

let running = true;
let consecutiveErrors = 0;
const once = process.argv.includes('--once');

async function tick() {
  try {
    const summary = await runCollectorTick();
    consecutiveErrors = 0;
    if (summary.accounts || summary.failed) {
      console.log(
        `[telemetry-worker] accounts=${summary.accounts} collected=${summary.collected} ` +
        `skipped=${summary.skipped} failed=${summary.failed}`
      );
    }
  } catch (error) {
    consecutiveErrors += 1;
    const delay = Math.min(30_000 * consecutiveErrors, 5 * 60_000);
    console.error(`[telemetry-worker] tick failed (${consecutiveErrors} in a row):`, error.code || error.message);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function shutdown(signal) {
  if (!running) return;
  running = false;
  console.log(`[telemetry-worker] ${signal} received, shutting down...`);
  await closePool().catch((error) => console.error('[telemetry-worker] pool close failed:', error.message));
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function main() {
  if (once) {
    await tick();
    await closePool();
    return;
  }
  console.log(`[telemetry-worker] started poll=${config.telemetryCollector.pollIntervalMs}ms`);
  while (running) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, Math.max(5000, config.telemetryCollector.pollIntervalMs)));
  }
}

main().catch(async (error) => {
  console.error('[telemetry-worker] fatal:', error);
  await closePool().catch(() => {});
  process.exit(1);
});
