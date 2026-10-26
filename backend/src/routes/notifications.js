import { config } from '../config.js';
import { query, audit } from '../db.js';
import { sendOk, sendJson, readJsonBody, clientIp } from '../lib/http.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import {
  clampLimit,
  clampOffset,
  optionalString,
  optionalUuid,
  requireEmail,
  requireEnum,
  requirePhone,
  requireString,
} from '../lib/validate.js';
import { requireApiKey } from '../middleware/auth.js';
import { emailStatus } from '../providers/email.js';
import { whatsappStatus } from '../providers/whatsapp.js';
import {
  enqueueNotification,
  getQueueStats,
  requeueWaitingConfigJobs,
  resolveRecipients,
  runWorkerBatch,
} from '../services/notifications.js';

const SEVERITIES = ['info', 'warning', 'critical'];

function parseQuery(url) {
  return Object.fromEntries(url.searchParams.entries());
}

export function registerNotificationRoutes(router) {
  // ---------------------------------------------------------------------
  // Provider status: tells the dashboard whether credentials arrived yet.
  // ---------------------------------------------------------------------
  router.get('/api/v1/notifications/providers', (req, res) => {
    sendOk(res, { email: emailStatus(), whatsapp: whatsappStatus() });
  });

  router.get('/api/v1/notifications/stats', async (req, res) => {
    sendOk(res, await getQueueStats());
  });

  // ---------------------------------------------------------------------
  // Delivery history. Paged, filterable, read-only.
  // ---------------------------------------------------------------------
  router.get('/api/v1/notifications/logs', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const q = parseQuery(url);
    const limit = clampLimit(q.limit, { def: 50, max: 200 });
    const offset = clampOffset(q.offset);
    const channel = optionalString(q.channel, 'channel', { max: 20 });

    const filters = [];
    const params = [];

    if (channel) {
      params.push(requireEnum(channel, 'channel', ['email', 'whatsapp']));
      filters.push(`channel = $${params.length}`);
    }
    if (q.status) {
      params.push(String(q.status));
      filters.push(`status = $${params.length}`);
    }
    if (q.machineId) {
      params.push(optionalUuid(q.machineId, 'machineId'));
      filters.push(`job_id IN (SELECT id FROM notification_jobs WHERE machine_id = $${params.length})`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT id, job_id, channel, to_address, attempt, status, provider,
              provider_message_id, error_code, error_message, duration_ms, created_at
         FROM notification_logs
         ${where}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const total = await query(`SELECT count(*)::int AS count FROM notification_logs ${where}`, params);

    sendOk(res, rows, { limit, offset, total: total.rows[0].count });
  });

  router.get('/api/v1/notifications/jobs', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const q = parseQuery(url);
    const limit = clampLimit(q.limit, { def: 50, max: 200 });
    const offset = clampOffset(q.offset);

    const filters = [];
    const params = [];

    if (q.status) {
      params.push(String(q.status));
      filters.push(`status = $${params.length}`);
    }
    if (q.channel) {
      params.push(requireEnum(q.channel, 'channel', ['email', 'whatsapp']));
      filters.push(`channel = $${params.length}`);
    }
    if (q.machineId) {
      params.push(optionalUuid(q.machineId, 'machineId'));
      filters.push(`machine_id = $${params.length}`);
    }
    if (q.clientId) {
      params.push(optionalUuid(q.clientId, 'clientId'));
      filters.push(`client_id = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT id, channel, kind, severity, to_address, to_name, subject, status,
              attempts, max_attempts, scheduled_at, sent_at, last_error,
              client_id, machine_id, created_at, updated_at
         FROM notification_jobs
         ${where}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const total = await query(`SELECT count(*)::int AS count FROM notification_jobs ${where}`, params);

    sendOk(res, rows, { limit, offset, total: total.rows[0].count });
  });

  // ---------------------------------------------------------------------
  // Enqueue a notification (used by the dashboard "push alert" buttons).
  // ---------------------------------------------------------------------
  router.post('/api/v1/notifications/send', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    const channel = requireEnum(body.channel, 'channel', ['email', 'whatsapp']);
    const rawTo = requireString(body.to, 'to', { max: 254 });
    const to = channel === 'email'
      ? requireEmail(rawTo, 'to')
      : requirePhone(rawTo, 'to');

    const severity = body.severity
      ? requireEnum(body.severity, 'severity', SEVERITIES)
      : 'info';

    const { job, deduplicated } = await enqueueNotification({
      channel,
      to,
      toName: optionalString(body.toName, 'toName', { max: 200 }),
      kind: body.kind ? String(body.kind).slice(0, 40) : 'manual',
      severity,
      code: optionalString(body.templateCode, 'templateCode', { max: 80 }),
      locale: optionalString(body.locale, 'locale', { max: 10 }) ?? 'en',
      variables: typeof body.variables === 'object' && body.variables ? body.variables : {},
      subject: optionalString(body.subject, 'subject', { max: 300 }),
      body: optionalString(body.body, 'body', { max: 8000 }),
      payload: typeof body.payload === 'object' && body.payload ? body.payload : {},
      clientId: optionalUuid(body.clientId, 'clientId'),
      machineId: optionalUuid(body.machineId, 'machineId'),
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      dedupeKey: optionalString(body.dedupeKey, 'dedupeKey', { max: 200 }),
    });

    await audit({
      action: 'notification.enqueue',
      actorType: 'api',
      entityType: 'notification_job',
      entityId: job?.id,
      after: { channel, to },
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });

    sendJson(res, 202, {
      ok: true,
      data: {
        jobId: job?.id ?? null,
        status: job?.status ?? 'unknown',
        deduplicated,
        note: 'Queued for the notification worker.',
      },
    });
  });

  // ---------------------------------------------------------------------
  // Test buttons. They enqueue like any other message; the response states
  // clearly whether the vendor credentials exist yet.
  // ---------------------------------------------------------------------
  const registerTestRoute = (channel, parseAddress) => async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);
    const to = parseAddress(body.to);

    const status = channel === 'email' ? emailStatus() : whatsappStatus();

    const { job, deduplicated } = await enqueueNotification({
      channel,
      to,
      toName: optionalString(body.toName, 'toName', { max: 200 }),
      kind: 'test',
      code: 'test_message',
      variables: { occurred_at: new Date().toISOString() },
      payload: { source: 'dashboard-test-button' },
      dedupeKey: null,
    });

    sendJson(res, 202, {
      ok: true,
      data: {
        jobId: job?.id ?? null,
        channel,
        to,
        providerConfigured: status.configured,
        missingConfig: status.configured ? [] : status.missing,
        deduplicated,
        note: status.configured
          ? 'Queued. The worker will deliver it shortly.'
          : `${channel} credentials are not supplied yet, so the message is parked as waiting_config and has not been sent.`,
      },
    });
  };

  router.post('/api/v1/notifications/test/email', registerTestRoute('email', (v) => requireEmail(v, 'to')));
  router.post('/api/v1/notifications/test/whatsapp', registerTestRoute('whatsapp', (v) => requirePhone(v, 'to')));

  // ---------------------------------------------------------------------
  // Retry a single failed job / requeue everything parked on config.
  // ---------------------------------------------------------------------
  router.post('/api/v1/notifications/jobs/retry', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    if (body.allWaitingConfig === true) {
      const count = await requeueWaitingConfigJobs();
      return sendOk(res, { requeued: count });
    }

    const jobId = optionalUuid(body.jobId, 'jobId');
    if (!jobId) throw new ValidationError('Supply `jobId` or `allWaitingConfig: true`.');

    const { rows } = await query(
      `UPDATE notification_jobs
          SET status = 'pending', scheduled_at = now(), attempts = 0, last_error = NULL
        WHERE id = $1 AND status IN ('failed', 'waiting_config', 'cancelled')
        RETURNING id, status`,
      [jobId]
    );
    if (!rows[0]) throw new NotFoundError('No retryable job with that id');
    sendOk(res, rows[0]);
  });

  // ---------------------------------------------------------------------
  // Alert ingestion: the vendor API data pipeline posts a reading here and the backend
  // decides whether a threshold was crossed and who should be notified.
  // ---------------------------------------------------------------------
  router.post('/api/v1/alerts/temperature', async (req, res) => {
    requireApiKey(req);
    const body = await readJsonBody(req);

    const serial = requireString(body.machineSerial ?? body.serial, 'machineSerial', { max: 64 });
    const temperature = Number(body.temperatureC ?? body.temperature);
    if (!Number.isFinite(temperature)) {
      throw new ValidationError('`temperatureC` must be a number');
    }

    const { rows: machineRows } = await query(
      `SELECT m.id, m.serial, m.name, m.location, m.client_id, c.name AS client_name
         FROM machines m
         LEFT JOIN clients c ON c.id = m.client_id
        WHERE m.serial = $1 OR m.device_id = $1
        LIMIT 1`,
      [serial]
    );
    const machine = machineRows[0];
    if (!machine) throw new NotFoundError(`Unknown machine "${serial}"`);

    const thresholdResult = await query(
      `SELECT metric, min_value, max_value, severity
         FROM alert_thresholds
        WHERE metric = 'temperature' AND enabled
          AND (machine_id = $1 OR (machine_id IS NULL AND client_id = $2)
               OR (machine_id IS NULL AND client_id IS NULL))
        ORDER BY (machine_id IS NOT NULL) DESC, (client_id IS NOT NULL) DESC
        LIMIT 1`,
      [machine.id, machine.client_id]
    );

    const threshold = thresholdResult.rows[0] ?? {
      min_value: config.alerts.tempLowC,
      max_value: config.alerts.tempHighC,
      severity: 'critical',
    };

    const min = Number(threshold.min_value);
    const max = Number(threshold.max_value);

    let breached = null;
    if (Number.isFinite(max) && temperature > max) breached = 'high';
    else if (Number.isFinite(min) && temperature < min) breached = 'low';

    if (!breached) {
      return sendOk(res, {
        machineSerial: machine.serial,
        temperatureC: temperature,
        breached: false,
        threshold: { min, max },
        notifications: [],
      });
    }

    const templateCode = breached === 'high' ? 'temperature_high' : 'temperature_low';
    const thresholdValue = breached === 'high' ? max : min;
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    const severity = threshold.severity ?? 'critical';

    // 60-minute dedupe window per machine+direction so a flapping sensor
    // cannot flood the customer with alerts.
    const bucket = Math.floor(occurredAt.getTime() / (60 * 60 * 1000));

    const channels = Array.isArray(body.channels) && body.channels.length > 0
      ? body.channels.filter((c) => ['email', 'whatsapp'].includes(c))
      : ['email', 'whatsapp'];

    const queued = [];

    for (const channel of channels) {
      const recipients = await resolveRecipients({
        machineId: machine.id,
        channel,
        severity,
      });

      for (const recipient of recipients) {
        const variables = {
          severity,
          machine_name: machine.name ?? machine.serial,
          machine_serial: machine.serial,
          client_name: machine.client_name ?? '-',
          location: machine.location ?? '-',
          temperature_c: temperature,
          threshold_c: thresholdValue,
          occurred_at: occurredAt.toISOString(),
        };

        const { job, deduplicated } = await enqueueNotification({
          channel,
          to: recipient.address,
          toName: recipient.name,
          kind: 'alert',
          severity,
          code: templateCode,
          variables,
          payload: { temperatureC: temperature, breached, machineSerial: machine.serial },
          clientId: machine.client_id,
          machineId: machine.id,
          dedupeKey: `temp:${machine.id}:${breached}:${bucket}:${recipient.address}`,
        });

        queued.push({
          channel,
          to: recipient.address,
          jobId: job?.id ?? null,
          deduplicated,
        });
      }
    }

    await audit({
      action: 'alert.temperature.breach',
      actorType: 'api',
      entityType: 'machine',
      entityId: machine.id,
      after: { temperatureC: temperature, breached, threshold: thresholdValue },
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });

    sendJson(res, 202, {
      ok: true,
      data: {
        machineSerial: machine.serial,
        temperatureC: temperature,
        breached,
        threshold: { min, max },
        severity,
        notifications: queued,
        note: queued.length === 0
          ? 'No notification recipient is configured for this machine.'
          : 'Alerts queued for delivery.',
      },
    });
  });

  // ---------------------------------------------------------------------
  // Drain the queue synchronously (used by tests and by the dashboard's
  // "send now" action when the background worker is not running).
  // ---------------------------------------------------------------------
  router.post('/api/v1/notifications/process', async (req, res) => {
    requireApiKey(req);
    const summary = await runWorkerBatch({ batchSize: clampLimit(req.url.length, { def: 10, max: 50 }) });
    sendOk(res, summary);
  });
}
