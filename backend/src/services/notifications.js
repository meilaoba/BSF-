import os from 'node:os';
import { config } from '../config.js';
import { query, withTransaction, audit } from '../db.js';
import {
  ProviderNotConfiguredError,
  ProviderError,
  ValidationError,
} from '../lib/errors.js';
import { sendEmail } from '../providers/email.js';
import { sendWhatsApp } from '../providers/whatsapp.js';
import { buildMessage } from './templates.js';

const WORKER_ID = `${os.hostname()}:${process.pid}`;

const CHANNELS = ['email', 'whatsapp'];
const SEVERITY_RANK = { info: 1, warning: 2, critical: 3 };

/**
 * Creates a job in the queue. Nothing is sent inline: the worker picks it up.
 * This keeps API latency low and survives process restarts.
 */
export async function enqueueNotification(input) {
  const {
    channel,
    to,
    toName = null,
    kind = 'alert',
    severity = null,
    code = null,
    locale = 'en',
    variables = {},
    subject = null,
    body = null,
    payload = {},
    clientId = null,
    machineId = null,
    scheduledAt = null,
    maxAttempts = config.worker.maxAttempts,
    dedupeKey = null,
  } = input;

  if (!CHANNELS.includes(channel)) {
    throw new ValidationError(`\`channel\` must be one of: ${CHANNELS.join(', ')}`);
  }
  if (!to) {
    throw new ValidationError('`to` is required');
  }

  const message = await buildMessage({ code, channel, locale, variables, subject, body });
  if (!message.body) {
    throw new ValidationError('Notification body is empty; supply `body` or a template `code`.');
  }

  const { rows } = await query(
    `INSERT INTO notification_jobs
       (channel, kind, severity, to_address, to_name, subject, body, provider_template,
        payload, client_id, machine_id, scheduled_at, max_attempts, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12, now()), $13, $14)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      channel,
      kind,
      severity,
      to,
      toName,
      message.subject,
      message.body,
      message.providerTemplate,
      JSON.stringify({ ...payload, variables, templateCode: message.templateCode }),
      clientId,
      machineId,
      scheduledAt,
      maxAttempts,
      dedupeKey,
    ]
  );

  if (rows[0]) return { job: rows[0], deduplicated: false };

  // Dedupe key already existed: return the existing job instead of erroring.
  const existing = await query(
    'SELECT * FROM notification_jobs WHERE dedupe_key = $1 LIMIT 1',
    [dedupeKey]
  );
  return { job: existing.rows[0] ?? null, deduplicated: true };
}

/**
 * Resolves every enabled recipient that should receive an alert for a machine,
 * honouring global -> client -> machine -> user preference precedence.
 */
export async function resolveRecipients({ machineId, channel, severity = 'critical' }) {
  const machineResult = await query(
    'SELECT id, client_id FROM machines WHERE id = $1',
    [machineId]
  );
  const machine = machineResult.rows[0];
  if (!machine) return [];

  const { rows } = await query(
    `SELECT DISTINCT ON (lower(candidate.address))
            candidate.address,
            candidate.name,
            candidate.user_id,
            COALESCE(p.enabled, true)      AS pref_enabled,
            COALESCE(p.min_severity, 'warning') AS min_severity,
            p.machine_id                   AS pref_machine_id,
            p.user_id                      AS pref_user_id
       FROM (
              SELECT r.address, r.name, r.user_id, r.machine_id, r.client_id
                FROM notification_recipients r
               WHERE r.enabled
                 AND r.channel = $2
                 AND (
                       r.machine_id = $1
                    OR (r.machine_id IS NULL AND r.user_id IS NOT NULL
                        AND EXISTS (
                              SELECT 1 FROM users u
                               WHERE u.id = r.user_id AND u.machine_id = $1
                            ))
                    OR (r.machine_id IS NULL AND r.user_id IS NULL
                        AND r.client_id = $3)
                     )
            ) AS candidate
       LEFT JOIN notification_preferences p
              ON p.channel = $2
             AND (
                   (p.machine_id IS NOT NULL AND p.machine_id = candidate.machine_id)
                OR (p.user_id IS NOT NULL AND p.user_id = candidate.user_id)
                OR (p.client_id IS NOT NULL AND p.client_id = candidate.client_id)
                OR (p.scope = 'global' AND p.client_id IS NULL
                    AND p.machine_id IS NULL AND p.user_id IS NULL)
                 )
      ORDER BY lower(candidate.address),
               p.machine_id NULLS LAST,
               p.user_id NULLS LAST`,
    [machineId, channel, machine.client_id]
  );

  const rank = SEVERITY_RANK[severity] ?? 3;
  return rows.filter(
    (row) => row.pref_enabled && (SEVERITY_RANK[row.min_severity] ?? 2) <= rank
  );
}
/**
 * Claims a batch of due jobs with SKIP LOCKED so several worker processes can
 * run side by side without ever double-sending.
 */
async function claimJobs(batchSize) {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE notification_jobs
          SET status = 'pending', locked_at = NULL, locked_by = NULL
        WHERE status = 'processing'
          AND locked_at < now() - ($1 || ' seconds')::interval`,
      [String(config.worker.lockTimeoutSeconds)]
    );

    const { rows } = await client.query(
      `SELECT id
         FROM notification_jobs
        WHERE status = 'pending'
          AND scheduled_at <= now()
        ORDER BY scheduled_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [batchSize]
    );

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const claimed = await client.query(
      `UPDATE notification_jobs
          SET status = 'processing', locked_at = now(), locked_by = $2
        WHERE id = ANY($1::uuid[])
        RETURNING *`,
      [ids, WORKER_ID]
    );

    return claimed.rows;
  });
}

function backoffSeconds(attempt) {
  // 1x, 2x, 4x, 8x... capped at 1 hour.
  const multiplier = 2 ** Math.max(0, attempt - 1);
  return Math.min(config.worker.retryBaseSeconds * multiplier, 3600);
}

async function logAttempt({ job, status, result, error, durationMs }) {
  await query(
    `INSERT INTO notification_logs
       (job_id, channel, to_address, attempt, status, provider,
        provider_message_id, error_code, error_message, response, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      job.id,
      job.channel,
      job.to_address,
      job.attempts,
      status,
      job.channel === 'email' ? config.email.provider : config.whatsapp.provider,
      result?.providerMessageId ?? null,
      error?.code ?? null,
      error?.message ?? null,
      result?.response ? JSON.stringify(result.response).slice(0, 8000) : null,
      durationMs ?? result?.durationMs ?? null,
    ]
  );
}

async function deliver(job) {
  const variables =
    job.payload?.variables && typeof job.payload.variables === 'object'
      ? job.payload.variables
      : {};

  if (job.channel === 'email') {
    return sendEmail({
      to: job.to_address,
      subject: job.subject || 'BSF notification',
      text: job.body,
      html: job.payload?.html || undefined,
    });
  }

  return sendWhatsApp({
    to: job.to_address,
    text: job.body,
    template: job.provider_template || undefined,
    variables,
  });
}

/**
 * Sends one claimed job and records the outcome.
 * Returns a short status string used for reporting.
 */
export async function processJob(job) {
  const attempt = job.attempts + 1;
  const started = Date.now();

  try {
    const result = await deliver(job);
    const durationMs = Date.now() - started;

    await query(
      `UPDATE notification_jobs
          SET status = 'sent', attempts = $2, sent_at = now(),
              locked_at = NULL, locked_by = NULL, last_error = NULL
        WHERE id = $1`,
      [job.id, attempt]
    );
    await logAttempt({ job: { ...job, attempts: attempt }, status: 'sent', result, durationMs });

    return 'sent';
  } catch (err) {
    const durationMs = Date.now() - started;
    const isConfigError = err instanceof ProviderNotConfiguredError;
    const retryable = isConfigError || err?.retryable !== false;

    let status;
    let nextAttemptAt = null;

    if (isConfigError) {
      // Credentials are simply not supplied yet. Park the job; do NOT count
      // this as a delivery failure, and never report it as sent.
      status = 'waiting_config';
    } else if (!retryable || attempt >= job.max_attempts) {
      status = 'failed';
    } else {
      status = 'pending';
      nextAttemptAt = new Date(Date.now() + backoffSeconds(attempt) * 1000);
    }

    await query(
      `UPDATE notification_jobs
          SET status = $2, attempts = $3, last_error = $4,
              scheduled_at = COALESCE($5, scheduled_at),
              locked_at = NULL, locked_by = NULL
        WHERE id = $1`,
      [job.id, status, attempt, String(err?.message ?? err).slice(0, 1000), nextAttemptAt]
    );
    await logAttempt({
      job: { ...job, attempts: attempt },
      status,
      error: err,
      durationMs,
    });

    return status;
  }
}

/**
 * Claims and processes one batch. Returns a summary for logging/health output.
 */
export async function runWorkerBatch({ batchSize = config.worker.batchSize } = {}) {
  const jobs = await claimJobs(batchSize);
  const summary = { claimed: jobs.length, sent: 0, failed: 0, waiting_config: 0, pending: 0 };

  for (const job of jobs) {
    try {
      const status = await processJob(job);
      summary[status] = (summary[status] ?? 0) + 1;
    } catch (err) {
      console.error(`[worker] job ${job.id} crashed:`, err.message);
      summary.failed += 1;
    }
  }

  return summary;
}

/**
 * Called when an operator finishes configuring the vendor credentials:
 * re-queues every job that was parked with `waiting_config`.
 */
export async function requeueWaitingConfigJobs() {
  const { rowCount } = await query(
    `UPDATE notification_jobs
        SET status = 'pending', scheduled_at = now(), last_error = NULL
      WHERE status = 'waiting_config'`
  );
  return rowCount ?? 0;
}

export async function getQueueStats() {
  const { rows } = await query(
    `SELECT status, count(*)::int AS count
       FROM notification_jobs
      GROUP BY status`
  );
  const stats = { pending: 0, processing: 0, sent: 0, failed: 0, waiting_config: 0, cancelled: 0 };
  for (const row of rows) stats[row.status] = row.count;
  return stats;
}

export { WORKER_ID };