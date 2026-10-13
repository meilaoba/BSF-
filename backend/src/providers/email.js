import { config } from '../config.js';
import { ProviderNotConfiguredError, ProviderError } from '../lib/errors.js';
import { httpRequest } from './http-client.js';

/**
 * Email provider adapter.
 *
 * The customer's mail vendor credentials are not available yet, so this module
 * only guarantees one thing: it refuses to claim success. When credentials are
 * missing it throws EMAIL_PROVIDER_NOT_CONFIGURED and the queue parks the job
 * as `waiting_config`.
 *
 * Wiring the real vendor later means editing ONLY the `dispatch` map below —
 * the queue, retries, logging and API surface stay untouched.
 */

const DEFAULT_BASE_URLS = {
  resend: 'https://api.resend.com',
  sendgrid: 'https://api.sendgrid.com',
};

function missingFields() {
  const missing = [];
  if (!config.email.apiUrl) missing.push('EMAIL_API_URL');
  if (!config.email.apiKey) missing.push('EMAIL_API_KEY');
  if (!config.email.from) missing.push('EMAIL_FROM');
  return missing;
}

export function emailStatus() {
  const missing = missingFields();
  return {
    channel: 'email',
    provider: config.email.provider,
    configured: missing.length === 0,
    missing,
  };
}

function assertConfigured() {
  const missing = missingFields();
  if (missing.length > 0) {
    const err = new ProviderNotConfiguredError('email');
    err.details = { missing };
    throw err;
  }
}

function fromHeader() {
  const name = config.email.fromName;
  return name ? `${name} <${config.email.from}>` : config.email.from;
}

function baseUrl() {
  return (
    config.email.apiUrl || DEFAULT_BASE_URLS[config.email.provider] || ''
  ).replace(/\/+$/, '');
}

async function sendGeneric({ to, subject, text, html }) {
  const { status, body, durationMs } = await httpRequest({
    url: `${baseUrl()}/send`,
    provider: 'email',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.email.apiKey}`,
      'X-Api-Key': config.email.apiKey,
    },
    body: {
      from: config.email.from,
      fromName: config.email.fromName,
      replyTo: config.email.replyTo || undefined,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html: html || text,
    },
  });

  return {
    providerMessageId: body?.id ?? body?.messageId ?? body?.message_id ?? null,
    httpStatus: status,
    durationMs,
    response: body,
  };
}

async function sendResend({ to, subject, text, html }) {
  const { status, body, durationMs } = await httpRequest({
    url: `${baseUrl()}/emails`,
    provider: 'email',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.email.apiKey}`,
    },
    body: {
      from: fromHeader(),
      reply_to: config.email.replyTo || undefined,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html: html || text,
    },
  });

  return {
    providerMessageId: body?.id ?? null,
    httpStatus: status,
    durationMs,
    response: body,
  };
}

async function sendSendgrid({ to, subject, text, html }) {
  const recipients = (Array.isArray(to) ? to : [to]).map((address) => ({ email: address }));
  const { status, body, durationMs } = await httpRequest({
    url: `${baseUrl()}/v3/mail/send`,
    provider: 'email',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.email.apiKey}`,
    },
    body: {
      personalizations: [{ to: recipients, subject }],
      from: { email: config.email.from, name: config.email.fromName },
      reply_to: config.email.replyTo ? { email: config.email.replyTo } : undefined,
      content: [
        { type: 'text/plain', value: text || '' },
        { type: 'text/html', value: html || text || '' },
      ],
    },
  });

  return {
    // SendGrid returns 202 with an empty body and an X-Message-Id header.
    providerMessageId: body?.id ?? null,
    httpStatus: status,
    durationMs,
    response: body ?? { accepted: true },
  };
}

const dispatch = {
  generic: sendGeneric,
  resend: sendResend,
  sendgrid: sendSendgrid,
};

export async function sendEmail({ to, subject, text, html }) {
  assertConfigured();

  const handler = dispatch[config.email.provider];
  if (!handler) {
    throw new ProviderError(
      'EMAIL_PROVIDER_UNSUPPORTED',
      `Unknown EMAIL_PROVIDER "${config.email.provider}". Supported: ${Object.keys(dispatch).join(', ')}.`,
      { status: 500, retryable: false }
    );
  }

  return handler({ to, subject, text, html });
}