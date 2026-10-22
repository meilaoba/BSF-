import process from 'node:process';
import { validateEncryptionKey } from './lib/crypto.js';

const nodeEnv = String(process.env.NODE_ENV || 'development').trim();

function str(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === null ? fallback : String(v).trim();
}

function num(name, fallback) {
  const raw = str(name);
  if (raw === '') return fallback;
  const v = Number(raw);
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
  env: nodeEnv,
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

  auth: {
    // The vendor remains the source of truth for credentials and roles.
    enabled: bool('VENDOR_AUTH_ENABLED', false),
    required: bool('AUTH_REQUIRED', nodeEnv === 'production'),
    vendor: {
      loginUrl: str('VENDOR_LOGIN_URL', 'https://iot.creekscomposter.com:8888/user/login'),
      requestFormat: str('VENDOR_LOGIN_FORMAT', 'json').toLowerCase(),
      timeoutMs: num('VENDOR_AUTH_TIMEOUT_MS', 10000),
    },
    sessionTtlSeconds: num('AUTH_SESSION_TTL_SECONDS', 8 * 60 * 60),
    cookieName: str('AUTH_SESSION_COOKIE', 'bsf_session'),
    csrfCookieName: str('AUTH_CSRF_COOKIE', 'bsf_csrf'),
    cookieSecure: bool('AUTH_COOKIE_SECURE', nodeEnv === 'production'),
    tokenEncryptionKey: str('AUTH_TOKEN_ENCRYPTION_KEY'),
    loginMaxAttempts: num('AUTH_LOGIN_MAX_ATTEMPTS', 5),
    loginWindowSeconds: num('AUTH_LOGIN_WINDOW_SECONDS', 15 * 60),
    loginLockSeconds: num('AUTH_LOGIN_LOCK_SECONDS', 15 * 60),
    ipMaxAttempts: num('AUTH_IP_MAX_ATTEMPTS', 30),
  },
};

export const isProduction = config.env === 'production';

if (!config.databaseUrl) {
  // Fail fast: the API and the worker are useless without a database.
  throw new Error('DATABASE_URL is not set. Load /etc/bsf-backend.env before starting.');
}

if (config.auth.required && !config.auth.enabled) {
  throw new Error('AUTH_REQUIRED=true requires VENDOR_AUTH_ENABLED=true.');
}

if (config.auth.enabled) {
  if (!config.auth.tokenEncryptionKey) {
    throw new Error('AUTH_TOKEN_ENCRYPTION_KEY is required when vendor authentication is enabled.');
  }
  try {
    validateEncryptionKey(config.auth.tokenEncryptionKey);
  } catch (err) {
    throw new Error(`Invalid AUTH_TOKEN_ENCRYPTION_KEY: ${err.message}`);
  }
  if (!['json', 'form'].includes(config.auth.vendor.requestFormat)) {
    throw new Error('VENDOR_LOGIN_FORMAT must be `json` or `form`.');
  }
}
