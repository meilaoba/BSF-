import { config } from '../config.js';
import { query } from '../db.js';
import { decryptSecret } from '../lib/crypto.js';
import { listAllVendorDevices } from '../providers/vendor-devices.js';
import { fetchVendorRealtimeDevices, mergeRealtimeDevices } from '../providers/vendor-realtime.js';
import { recordVendorTelemetrySamples } from './vendor-analytics.js';

const DEFAULT_INTERVALS = Object.freeze({ master_admin: 180, client_admin: 600, user: 600 });

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
            c.vendor_access_token_enc
       FROM vendor_collector_credentials c
       JOIN users u ON u.id = c.user_id
      WHERE c.vendor_access_token_enc IS NOT NULL
        AND u.status = 'active'
      ORDER BY u.id`
  );
  return rows;
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

  const result = await listAllVendorDevices({ token, pageNum: 1, pageSize: 100 });
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
