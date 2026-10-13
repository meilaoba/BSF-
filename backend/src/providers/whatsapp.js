import { config } from '../config.js';
import { ProviderNotConfiguredError, ProviderError } from '../lib/errors.js';
import { httpRequest } from './http-client.js';

/**
 * WhatsApp provider adapter.
 *
 * Same contract as the email adapter: with blank credentials it throws
 * WHATSAPP_PROVIDER_NOT_CONFIGURED rather than pretending the message went out.
 *
 * Supported values of WHATSAPP_PROVIDER:
 *   meta    - Meta WhatsApp Cloud API (graph.facebook.com)
 *   generic - any vendor that accepts a JSON POST, configured via WHATSAPP_API_URL
 *   twilio  - Twilio Messaging API
 */

const DEFAULT_BASE_URLS = {
  meta: 'https://graph.facebook.com',
  twilio: 'https://api.twilio.com',
};

const META_API_VERSION = 'v21.0';

function missingFields() {
  const missing = [];
  const provider = config.whatsapp.provider;

  if (!config.whatsapp.token) missing.push('WHATSAPP_TOKEN');

  if (provider === 'twilio') {
    if (!config.whatsapp.phoneId) missing.push('WHATSAPP_PHONE_ID (Twilio Account SID)');
    if (!config.whatsapp.apiUrl) missing.push('WHATSAPP_API_URL (Twilio Auth Token)');
  } else if (provider === 'meta') {
    if (!config.whatsapp.phoneId) missing.push('WHATSAPP_PHONE_ID');
  } else {
    if (!config.whatsapp.apiUrl) missing.push('WHATSAPP_API_URL');
  }

  return missing;
}

export function whatsappStatus() {
  const missing = missingFields();
  return {
    channel: 'whatsapp',
    provider: config.whatsapp.provider,
    configured: missing.length === 0,
    missing,
    deliveryMode: config.whatsapp.provider === 'meta' ? 'template + text' : 'text',
  };
}

function assertConfigured() {
  const missing = missingFields();
  if (missing.length > 0) {
    const err = new ProviderNotConfiguredError('whatsapp');
    err.details = { missing };
    throw err;
  }
}

function baseUrl() {
  return (
    config.whatsapp.apiUrl || DEFAULT_BASE_URLS[config.whatsapp.provider] || ''
  ).replace(/\/+$/, '');
}

async function sendMeta({ to, text, template, variables }) {
  // Meta requires an approved template for business-initiated (alert) messages.
  // A free-form text message is only valid inside an open 24h service window.
  const message = template
    ? {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: config.whatsapp.language || 'en' },
          ...(variables && Object.keys(variables).length > 0
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: Object.values(variables).map((value) => ({
                      type: 'text',
                      text: String(value),
                    })),
                  },
                ],
              }
            : {}),
        },
      }
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      };

  const { status, body, durationMs } = await httpRequest({
    url: `${baseUrl()}/${META_API_VERSION}/${config.whatsapp.phoneId}/messages`,
    provider: 'whatsapp',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.whatsapp.token}`,
    },
    body: message,
  });

  return {
    providerMessageId: body?.messages?.[0]?.id ?? null,
    httpStatus: status,
    durationMs,
    response: body,
  };
}

async function sendGeneric({ to, text, template, variables }) {
  const headers = { 'Content-Type': 'application/json' };

  if (config.whatsapp.authHeader.toLowerCase() === 'authorization') {
    headers.Authorization = /^Bearer /i.test(config.whatsapp.token)
      ? config.whatsapp.token
      : `Bearer ${config.whatsapp.token}`;
  } else {
    headers[config.whatsapp.authHeader] = config.whatsapp.token;
  }

  const { status, body, durationMs } = await httpRequest({
    url: `${baseUrl()}/messages`,
    provider: 'whatsapp',
    headers,
    body: {
      to,
      type: template ? 'template' : 'text',
      template: template || undefined,
      variables: variables || undefined,
      text: text || undefined,
      phoneNumberId: config.whatsapp.phoneId || undefined,
    },
  });

  return {
    providerMessageId:
      body?.id ?? body?.messageId ?? body?.messages?.[0]?.id ?? null,
    httpStatus: status,
    durationMs,
    response: body,
  };
}

async function sendTwilio({ to, text }) {
  const sid = config.whatsapp.phoneId;
  const authToken = config.whatsapp.apiUrl;
  const from = config.whatsapp.token;

  const form = new URLSearchParams({ To: `whatsapp:${to}`, Body: text });
  form.set('From', from.startsWith('whatsapp:') ? from : `whatsapp:${from}`);

  const started = Date.now();
  let response;
  try {
    response = await fetch(`${baseUrl()}/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString('base64')}`,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(config.providerTimeoutMs),
    });
  } catch (err) {
    throw new ProviderError('PROVIDER_UNREACHABLE', `Twilio unreachable: ${err.message}`, {
      details: { provider: 'whatsapp' },
    });
  }

  const durationMs = Date.now() - started;
  const parsed = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ProviderError(
      `PROVIDER_HTTP_${response.status}`,
      `Twilio rejected the request: ${parsed?.message ?? response.status}`,
      { status: 502, retryable: response.status >= 500 || response.status === 429 }
    );
  }

  return {
    providerMessageId: parsed?.sid ?? null,
    httpStatus: response.status,
    durationMs,
    response: parsed,
  };
}

const dispatch = {
  meta: sendMeta,
  generic: sendGeneric,
  twilio: sendTwilio,
};

export async function sendWhatsApp({ to, text, template, variables }) {
  assertConfigured();

  const handler = dispatch[config.whatsapp.provider];
  if (!handler) {
    throw new ProviderError(
      'WHATSAPP_PROVIDER_UNSUPPORTED',
      `Unknown WHATSAPP_PROVIDER "${config.whatsapp.provider}". Supported: ${Object.keys(dispatch).join(', ')}.`,
      { status: 500, retryable: false }
    );
  }

  return handler({ to, text, template, variables });
}