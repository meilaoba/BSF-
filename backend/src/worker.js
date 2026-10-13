import process from 'node:process';
import { config } from './config.js';
import { closePool } from './db.js';
import { runWorkerBatch, WORKER_ID } from './services/notifications.js';

/**
 * Notification worker.
 *
 * Runs as its own systemd unit so a vendor outage or a slow API call can never
 * affect the HTTP API. Jobs are claimed with SELECT ... FOR UPDATE SKIP LOCKED,
 * so this process can be scaled out later without code changes.
 */

let running = true;
let consecutiveErrors = 0;

async function tick() {
  try {
    const summary = await runWorkerBatch();
    consecutiveErrors = 0;

    if (summary.claimed > 0) {
      console.log(
        `[worker] claimed=${summary.claimed} sent=${summary.sent} ` +
        `failed=${summary.failed} waiting_config=${summary.waiting_config} retry=${summary.pending}`
      );
    }
  } catch (err) {
    consecutiveErrors += 1;
    const delay = Math.min(5_000 * consecutiveErrors, 60_000);
    console.error(
      `[worker] batch failed (${consecutiveErrors} in a row), backing off ${delay}ms:`,
      err.message
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function loop() {
  console.log(`[worker] started as ${WORKER_ID}`);
  console.log(
    `[worker] poll=${config.worker.pollIntervalMs}ms batch=${config.worker.batchSize} ` +
    `maxAttempts=${config.worker.maxAttempts} retryBase=${config.worker.retryBaseSeconds}s`
  );

  while (running) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, config.worker.pollIntervalMs));
  }
}

async function shutdown(signal) {
  console.log(`[worker] ${signal} received, finishing current batch...`);
  running = false;
  try {
    await closePool();
  } catch (err) {
    console.error('[worker] error closing pool:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

loop().catch(async (err) => {
  console.error('[worker] fatal:', err);
  await closePool().catch(() => {});
  process.exit(1);
});