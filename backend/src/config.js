import process from 'node:process';

function str(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === null ? fallback : String(v).trim();
}

function num(name, fallback) {
  const v = Number(str(name));
  return Number.isFinite(v) ? v : fallback;
}

function bool(name, fallback = false) {
  const v = str(name).toLowerCase();
  if (v === '') return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function list(name) {
  return str(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  env: str('NODE_ENV', 'development'),
  host: str('HOST', '127.0.0.1'),
  port: num('PORT', 3000),
  databaseUrl: str('DATABASE_URL'),
  internalApiKey: str('INTERNAL_API_KEY'),
  corsAllowedOrigins: list('CORS_ALLOWED_ORIGINS'),
  providerTimeoutMs: num('PROVIDER_TIMEOUT_MS', 15000),

  email: {
    provider: str('EMAIL_PROVIDER', 'generic'),
    apiUrl: str('EMAIL_API_URL'),
    apiKey: str('EMAIL_API_KEY'),
    from: str('EMAIL_FROM'),
    fromName: str('EMAIL_FROM_NAME', 'BSF Smart Bin'),
    replyTo: str('EMAIL_REPLY_TO'),
  },

  whatsapp: {
    provider: str('WHATSAPP_PROVIDER', 'meta'),
    apiUrl: str('WHATSAPP_API_URL'),
    token: str('WHATSAPP_TOKEN'),
    phoneId: str('WHATSAPP_PHONE_ID'),
    authHeader: str('WHATSAPP_API_KEY_HEADER', 'Authorization'),
  },

  worker: {
    pollIntervalMs: num('WORKER_POLL_INTERVAL_MS', 5000),
    batchSize: num('WORKER_BATCH_SIZE', 10),
    maxAttempts: num('WORKER_MAX_ATTEMPTS', 5),
    retryBaseSeconds: num('WORKER_RETRY_BASE_SECONDS', 60),
    lockTimeoutSeconds: num('WORKER_LOCK_TIMEOUT_SECONDS', 300),
  },

  alerts: {
    tempHighC: num('ALERT_TEMP_HIGH_C', 58),
    tempLowC: num('ALERT_TEMP_LOW_C', 12),
  },
};

export const isProduction = config.env === 'production';

if (!config.databaseUrl) {
  // Fail fast: the API and the worker are useless without a database.
  throw new Error('DATABASE_URL is not set. Load /etc/bsf-backend.env before starting.');
}