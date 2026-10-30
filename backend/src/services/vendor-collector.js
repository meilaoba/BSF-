import { config } from '../config.js';
import { query } from '../db.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { listAllVendorDevices } from '../providers/vendor-devices.js';
import { fetchVendorRealtimeDevices, mergeRealtimeDevices } from '../providers/vendor-realtime.js';
import { refreshVendorToken } from '../providers/vendor-auth.js';
import { recordVendorTelemetrySamples } from './vendor-analytics.js';

const DEFAULT_INTERVALS = Object.freeze({ master_admin: 1800, client_admin: 1800, user: 1800 });

export function collectorVendorAccountId(account) {
  const value = account?.vendor_user_id ?? account?.vendorUserId;
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text ? text.slice(0, 160) : '';
}

export function collectorIntervalSeconds(role, settings = config.telemetryCollector) {
  if (role === 'master_admin') return Number(settings?.masterIntervalSeconds) || DEFAULT_INTERVALS.master_admin;
  return Number(settings?.clientIntervalSeconds) || DEFAULT_INTERVALS.client_admin;
}

export function collectorBucketStart(now, intervalSeconds) {
  const timestamp = new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('collector time is invalid');
  const intervalMs = Number(intervalSeconds) * 1000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('collector interval is invalid');
  return new Date(Math.floor(timestamp / intervalMs) * intervalMs);
}

async function collectorAccounts() {
  const { rows } = await query(
    `SELECT u.id AS user_id,
            u.vendor_user_id,
            u.role,
            c.vendor_access_token_enc,
            c.vendor_refresh_token_enc
       FROM vendor_collector_credentials c
       JOIN users u ON u.id = c.user_id
      WHERE c.vendor_access_token_enc IS NOT NULL
        AND u.status = 'active'
      ORDER BY u.id`
  );
  return rows;
}

export async function loadCollectorCredentials({ vendorUserId = null } = {}) {
  const { rows } = await query(
    `SELECT c.user_id, c.vendor_access_token_enc, c.vendor_refresh_token_enc,
            u.vendor_user_id, u.role
       FROM vendor_collector_credentials c
       JOIN users u ON u.id = c.user_id
      WHERE u.status = 'active'
        AND c.vendor_access_token_enc IS NOT NULL
        AND c.vendor_refresh_token_enc IS NOT NULL
        AND ($1::text IS NULL OR u.vendor_user_id = $1)
      ORDER BY c.updated_at DESC
      LIMIT 1`,
    [vendorUserId ? String(vendorUserId) : null]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    vendorUserId: row.vendor_user_id,
    role: row.role,
    accessToken: decryptSecret(row.vendor_access_token_enc, config.auth.tokenEncryptionKey),
    refreshToken: decryptSecret(row.vendor_refresh_token_enc, config.auth.tokenEncryptionKey),
  };
}

async function refreshCollectorAccount(account, currentAccessToken) {
  const refreshToken = decryptSecret(account.vendor_refresh_token_enc, config.auth.tokenEncryptionKey);
  const refreshed = await refreshVendorToken(currentAccessToken, refreshToken);
  const accessTokenEnc = encryptSecret(refreshed.token, config.auth.tokenEncryptionKey);
  const refreshTokenEnc = encryptSecret(refreshed.refreshToken, config.auth.tokenEncryptionKey);
  await query(
    `INSERT INTO vendor_collector_credentials
       (user_id, vendor_access_token_enc, vendor_refresh_token_enc, updated_at)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (user_id) DO UPDATE SET
       vendor_access_token_enc = EXCLUDED.vendor_access_token_enc,
       vendor_refresh_token_enc = EXCLUDED.vendor_refresh_token_enc,
       updated_at = now()`,
    [account.user_id, accessTokenEnc, refreshTokenEnc]
  );
  await query(
    `UPDATE auth_sessions
        SET vendor_access_token_enc = $2,
            vendor_refresh_token_enc = $3
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [account.user_id, accessTokenEnc, refreshTokenEnc]
  );
  console.info('[telemetry-worker] vendor token refreshed');
  return refreshed.token;
}
async function sampleExists({ vendorAccountId, capturedAt }) {
  const { rows } = await query(
    `SELECT 1
       FROM vendor_device_telemetry
      WHERE vendor_account_id = $1
        AND captured_at = $2
        AND sample_source = 'worker'
      LIMIT 1`,
    [vendorAccountId, capturedAt]
  );
  return rows.length > 0;
}

async function collectAccount(account, now) {
  const vendorAccountId = collectorVendorAccountId(account);
  if (!vendorAccountId) throw new Error('VENDOR_ACCOUNT_ID_MISSING');
  const intervalSeconds = collectorIntervalSeconds(account.role);
  const capturedAt = collectorBucketStart(now, intervalSeconds);
  if (await sampleExists({ vendorAccountId, capturedAt })) {
    return { skipped: true, saved: 0 };
  }

  let token;
  try {
    token = decryptSecret(account.vendor_access_token_enc, config.auth.tokenEncryptionKey);
  } catch {
    throw new Error('VENDOR_SESSION_UNREADABLE');
  }
  if (!token) throw new Error('VENDOR_SESSION_UNREADABLE');

  let result;
  try {
    result = await listAllVendorDevices({ token, pageNum: 1, pageSize: 100 });
  } catch (error) {
    if (error?.code !== 'VENDOR_SESSION_EXPIRED') throw error;
    token = await refreshCollectorAccount(account, token);
    result = await listAllVendorDevices({ token, pageNum: 1, pageSize: 100 });
  }
  let devices = result.records;
  if (config.auth.vendor.realtimeEnabled && devices.length) {
    try {
      const live = await fetchVendorRealtimeDevices({ token, devices });
      devices = mergeRealtimeDevices(devices, live);
    } catch (error) {
      console.warn('[telemetry-worker] realtime snapshot unavailable:', error.code || 'VENDOR_REALTIME_UNAVAILABLE');
    }
  }

  const saved = await recordVendorTelemetrySamples(devices, {
    vendorAccountId,
    capturedAt,
    sampleSource: 'worker',
    sampleIntervalSeconds: intervalSeconds,
  });
  return { skipped: false, saved };
}

export async function runCollectorTick({ now = new Date() } = {}) {
  if (!config.telemetryCollector.enabled || !config.auth.enabled) {
    return { accounts: 0, collected: 0, skipped: 0, failed: 0 };
  }
  const accounts = await collectorAccounts();
  const summary = { accounts: accounts.length, collected: 0, skipped: 0, failed: 0 };
  for (const account of accounts) {
    try {
      const result = await collectAccount(account, now);
      if (result.skipped) summary.skipped += 1;
      else if (result.saved > 0) summary.collected += 1;
    } catch (error) {
      summary.failed += 1;
      console.warn('[telemetry-worker] account collection failed:', error.code || error.message);
    }
  }
  return summary;
}
