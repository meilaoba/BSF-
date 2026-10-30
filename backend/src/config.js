import process from 'node:process';
import { validateEncryptionKey } from './lib/crypto.js';

const nodeEnv = String(process.env.NODE_ENV || 'development').trim();
const productionMode = nodeEnv === 'production';

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

function normalizeOrigin(raw, label) {
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a complete origin such as https://example.com`);
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== '/') {
    throw new Error(`${label} must contain only scheme and host (no path, query, credentials or fragment)`);
  }
  return url.origin;
}

function originList(name) {
  return [...new Set(list(name).map((origin) => (
    origin === '*' ? origin : normalizeOrigin(origin, name)
  )))];
}

const publicOrigin = normalizeOrigin(str('PUBLIC_ORIGIN'), 'PUBLIC_ORIGIN');
const corsAllowedOrigins = [...new Set([
  ...originList('CORS_ALLOWED_ORIGINS'),
  ...(publicOrigin ? [publicOrigin] : []),
])];

export const config = {
  env: nodeEnv,
  host: str('HOST', '127.0.0.1'),
  port: num('PORT', 3000),
  databaseUrl: str('DATABASE_URL'),
  internalApiKey: str('INTERNAL_API_KEY'),
  publicOrigin,
  corsAllowedOrigins,
  trustProxy: bool('TRUST_PROXY', productionMode),
  requireHttps: bool('REQUIRE_HTTPS', productionMode),
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

  telemetryCollector: {
    enabled: bool('TELEMETRY_COLLECTOR_ENABLED', true),
    pollIntervalMs: num('TELEMETRY_COLLECTOR_POLL_INTERVAL_MS', 30000),
    masterIntervalSeconds: num('TELEMETRY_COLLECTOR_MASTER_INTERVAL_SECONDS', 1800),
    clientIntervalSeconds: num('TELEMETRY_COLLECTOR_CLIENT_INTERVAL_SECONDS', 1800),
  },

  formula: {
    wasteReductionFactor: num('FORMULA_WASTE_REDUCTION_FACTOR', 1.5),
    energyFactorHkIsland: num('FORMULA_ENERGY_FACTOR_HK_ISLAND', 0.71),
    energyFactorOther: num('FORMULA_ENERGY_FACTOR_OTHER', 0.37),
    transportConstant: num('FORMULA_TRANSPORT_CONSTANT', 1.93),
    transportMonths: num('FORMULA_TRANSPORT_MONTHS', 12),
    transportDays: num('FORMULA_TRANSPORT_DAYS', 365),
    fertilizerRatio: num('FORMULA_FERTILIZER_RATIO', 0.12),
    standbyEnergyKwh: num('FORMULA_STANDBY_ENERGY_KWH', 1.5),
    humidityScale: num('HUMIDITY_DISPLAY_SCALE', 100),
  },

  alerts: {
    tempHighC: num('ALERT_TEMP_HIGH_C', 58),
    tempLowC: num('ALERT_TEMP_LOW_C', 12),
  },

  auth: {
    // The vendor remains the source of truth for credentials and roles.
    enabled: bool('VENDOR_AUTH_ENABLED', false),
    required: bool('AUTH_REQUIRED', productionMode),
    vendor: {
      loginUrl: str('VENDOR_LOGIN_URL', 'https://iot.creekscomposter.com:8888/user/login'),
      deviceListUrl: str('VENDOR_DEVICE_LIST_URL', 'https://iot.creekscomposter.com:8888/emDevice/queryListData'),
      realtimeEnabled: bool('VENDOR_REALTIME_ENABLED', false),
      realtimeUrl: str('VENDOR_REALTIME_WS_URL', 'wss://iot.creekscomposter.com:8888/ws'),
      realtimeTimeoutMs: num('VENDOR_REALTIME_TIMEOUT_MS', 4000),
      historyUrl: str('VENDOR_HISTORY_URL', 'https://iot.creekscomposter.com:8888/historyData/temperatureHumidityCurve'),
      historyTimeoutMs: num('VENDOR_HISTORY_TIMEOUT_MS', 15000),
      requestFormat: str('VENDOR_LOGIN_FORMAT', 'json').toLowerCase(),
      timeoutMs: num('VENDOR_AUTH_TIMEOUT_MS', 10000),
      deviceTimeoutMs: num('VENDOR_DEVICE_TIMEOUT_MS', 15000),
      accessTokenTtlDays: num('VENDOR_ACCESS_TOKEN_TTL_DAYS', 7),
      refreshTokenTtlDays: num('VENDOR_REFRESH_TOKEN_TTL_DAYS', 8),
      refreshUrl: str('VENDOR_REFRESH_URL', ''),
      dailyStatsUrl: str('VENDOR_DAILY_STATS_URL', ''),
      alertListUrl: str('VENDOR_ALERT_LIST_URL', ''),
    },
    sessionTtlSeconds: num('AUTH_SESSION_TTL_SECONDS', 8 * 60 * 60),
    cookieName: str('AUTH_SESSION_COOKIE', 'bsf_session'),
    csrfCookieName: str('AUTH_CSRF_COOKIE', 'bsf_csrf'),
    cookieSecure: bool('AUTH_COOKIE_SECURE', productionMode),
    tokenEncryptionKey: str('AUTH_TOKEN_ENCRYPTION_KEY'),
    loginMaxAttempts: num('AUTH_LOGIN_MAX_ATTEMPTS', 5),
    loginWindowSeconds: num('AUTH_LOGIN_WINDOW_SECONDS', 15 * 60),
    loginLockSeconds: num('AUTH_LOGIN_LOCK_SECONDS', 15 * 60),
    ipMaxAttempts: num('AUTH_IP_MAX_ATTEMPTS', 30),
  },

  environment: {
    hkoCurrentTemperatureUrl: str(
      'HKO_CURRENT_TEMPERATURE_URL',
      'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en'
    ),
    hkoDailyTemperatureUrl: str(
      'HKO_DAILY_TEMPERATURE_URL',
      'https://data.weather.gov.hk/weatherAPI/opendata/opendata.php?dataType=CLMTEMP&rformat=json&station=HKO'
    ),
    hkoStation: str('HKO_STATION', 'HKO'),
    hkoStationName: str('HKO_STATION_NAME', 'Hong Kong Observatory'),
    hkoTimeoutMs: num('HKO_TIMEOUT_MS', 15000),
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

if (config.requireHttps && !config.auth.cookieSecure) {
  throw new Error('REQUIRE_HTTPS=true requires AUTH_COOKIE_SECURE=true.');
}

if (isProduction) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(config.host)) {
    throw new Error('HOST must be a loopback address in production; expose the service through Nginx only.');
  }
  if (!config.publicOrigin) {
    throw new Error('PUBLIC_ORIGIN is required in production.');
  }
  if (!config.publicOrigin.startsWith('https://')) {
    throw new Error('PUBLIC_ORIGIN must use HTTPS in production.');
  }
  if (!config.trustProxy) {
    throw new Error('TRUST_PROXY must be true in production when running behind Nginx.');
  }
  if (!config.requireHttps) {
    throw new Error('REQUIRE_HTTPS must be true in production.');
  }
  if (config.corsAllowedOrigins.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS must not contain * in production.');
  }
  if (config.corsAllowedOrigins.some((origin) => !origin.startsWith('https://'))) {
    throw new Error('Every CORS_ALLOWED_ORIGINS entry must use HTTPS in production.');
  }
  if (!config.auth.required) {
    throw new Error('AUTH_REQUIRED must be true in production.');
  }
  if (!config.auth.cookieSecure) {
    throw new Error('AUTH_COOKIE_SECURE must be true in production.');
  }
  if (config.internalApiKey.length < 24) {
    throw new Error('INTERNAL_API_KEY must be at least 24 characters in production.');
  }
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
