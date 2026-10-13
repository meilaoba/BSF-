import { query } from '../db.js';

/**
 * Replaces {{placeholders}} in a template string.
 * Unknown placeholders are left intact so a missing variable is visible in the
 * delivered message instead of silently rendering an empty string.
 */
export function renderPlaceholders(template, variables = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    const value = key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), variables);
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/**
 * Looks up a template row for a code/channel/locale, falling back to `en`.
 * Returns null when no template exists (callers then use the inline body).
 */
export async function loadTemplate(code, channel, locale = 'en') {
  const { rows } = await query(
    `SELECT code, channel, locale, subject, body, provider_template
       FROM notification_templates
      WHERE code = $1 AND channel = $2 AND locale = $3 AND status = 'active'
      LIMIT 1`,
    [code, channel, locale]
  );
  if (rows[0]) return rows[0];
  if (locale === 'en') return null;

  const fallback = await query(
    `SELECT code, channel, locale, subject, body, provider_template
       FROM notification_templates
      WHERE code = $1 AND channel = $2 AND locale = 'en' AND status = 'active'
      LIMIT 1`,
    [code, channel]
  );
  return fallback.rows[0] ?? null;
}

/**
 * Builds the final subject/body for a job.
 * Explicit overrides always win over the stored template.
 */
export async function buildMessage({ code, channel, locale, variables, subject, body }) {
  const template = code ? await loadTemplate(code, channel, locale) : null;

  const finalSubject =
    subject ?? renderPlaceholders(template?.subject ?? '', variables);
  const finalBody = body ?? renderPlaceholders(template?.body ?? '', variables);

  return {
    subject: finalSubject || null,
    body: finalBody,
    providerTemplate: template?.provider_template ?? null,
    templateCode: template?.code ?? code ?? null,
  };
}

export const DEFAULT_TEMPLATES = {
  temperature_high: {
    email: {
      subject: '[{{severity}}] {{machine_name}} temperature {{temperature_c}}C exceeds {{threshold_c}}C',
      body: [
        'BSF Alert',
        '',
        'Machine: {{machine_name}} ({{machine_serial}})',
        'Client: {{client_name}}',
        'Location: {{location}}',
        '',
        'Temperature: {{temperature_c}} C',
        'Threshold: {{threshold_c}} C',
        'Recorded at: {{occurred_at}}',
      ].join('\n'),
    },
    whatsapp: {
      body: '[{{severity}}] {{machine_name}} temperature {{temperature_c}}C exceeds {{threshold_c}}C at {{occurred_at}}.',
    },
  },
  temperature_low: {
    email: {
      subject: '[{{severity}}] {{machine_name}} temperature {{temperature_c}}C below {{threshold_c}}C',
      body: [
        'BSF Alert',
        '',
        'Machine: {{machine_name}} ({{machine_serial}})',
        'Client: {{client_name}}',
        'Location: {{location}}',
        '',
        'Temperature: {{temperature_c}} C',
        'Threshold: {{threshold_c}} C',
        'Recorded at: {{occurred_at}}',
      ].join('\n'),
    },
    whatsapp: {
      body: '[{{severity}}] {{machine_name}} temperature {{temperature_c}}C below {{threshold_c}}C at {{occurred_at}}.',
    },
  },
  test_message: {
    email: {
      subject: 'BSF test notification',
      body: 'This is a test notification from the BSF Smart Kitchen Waste Bin platform.\n\nSent at: {{occurred_at}}',
    },
    whatsapp: {
      body: 'BSF test notification. Sent at {{occurred_at}}.',
    },
  },
};

export function fallbackTemplate(code, channel) {
  const entry = DEFAULT_TEMPLATES[code];
  if (!entry) return null;
  return entry[channel] ?? null;
}