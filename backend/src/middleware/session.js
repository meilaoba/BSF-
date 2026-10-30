import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { AppError, ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { clientIp } from '../lib/http.js';
import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256Hex,
} from '../lib/crypto.js';

const SESSION_COLUMNS = `
  s.id AS session_id,
  s.csrf_hash,
  s.expires_at,
  s.last_seen_at,
  u.id,
  u.vendor_user_id,
  u.vendor_type,
  u.vendor_username,
  u.email,
  u.phone,
  u.full_name,
  u.role,
  u.client_id,
  u.machine_id,
  u.status,
  u.metadata,
  u.last_login_at
`;

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function cookie(name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAge || 0))}`,
  ];
  if (httpOnly) parts.push('HttpOnly');
  if (config.auth.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export function authCookies(sessionToken, csrfToken, maxAgeSeconds = config.auth.sessionTtlSeconds) {
  return [
    cookie(config.auth.cookieName, sessionToken, { maxAge: maxAgeSeconds, httpOnly: true }),
    cookie(config.auth.csrfCookieName, csrfToken, { maxAge: maxAgeSeconds, httpOnly: false }),
  ];
}

export function clearAuthCookies() {
  return [
    cookie(config.auth.cookieName, '', { maxAge: 0, httpOnly: true }),
    cookie(config.auth.csrfCookieName, '', { maxAge: 0, httpOnly: false }),
  ];
}

export function publicUser(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    userName: row.vendor_username || row.full_name || row.email || 'user',
    fullName: row.full_name || null,
    email: row.email || null,
    phone: row.phone || null,
    role: row.role,
    vendorUserId: row.vendor_user_id == null ? null : String(row.vendor_user_id),
    clientId: row.client_id || null,
    machineId: row.machine_id || null,
    avatarUrl: metadata.vendor?.userIcon || null,
    vendorType: row.vendor_type == null ? null : Number(row.vendor_type),
    vendorParentId: metadata.vendor?.parentId || null,
  };
}

export async function createSession({ user, vendorTokens, req }) {
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(32);
  const sessionHash = sha256Hex(sessionToken);
  const csrfHash = sha256Hex(csrfToken);
  const ttl = Math.max(300, Math.min(Number(config.auth.sessionTtlSeconds) || 28800, 86400));
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
  const ip = clientIp(req);

  const accessTokenEnc = encryptSecret(vendorTokens.token, config.auth.tokenEncryptionKey);
  const refreshTokenEnc = encryptSecret(vendorTokens.refreshToken, config.auth.tokenEncryptionKey);

  // The browser session is intentionally short-lived. The collector credential
  // is stored separately so telemetry ingestion does not stop when the user
  // signs out or the local session expires.
  const row = await withTransaction(async (client) => {
    // Opportunistic cleanup keeps the session table bounded without another
    // long-running worker. Expired sessions are never accepted even before this.
    await client.query(
      `DELETE FROM auth_sessions
        WHERE expires_at < now() - interval '7 days'
           OR revoked_at < now() - interval '7 days'`
    );

    const { rows } = await client.query(
      `INSERT INTO auth_sessions
         (user_id, token_hash, csrf_hash, vendor_access_token_enc, vendor_refresh_token_enc,
          expires_at, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5, now() + ($6 * interval '1 second'), $7, $8)
       RETURNING id, expires_at`,
      [
        user.id,
        sessionHash,
        csrfHash,
        accessTokenEnc,
        refreshTokenEnc,
        ttl,
        ip || null,
        userAgent || null,
      ]
    );

    await client.query(
      `INSERT INTO vendor_collector_credentials
         (user_id, vendor_access_token_enc, vendor_refresh_token_enc, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET
         vendor_access_token_enc = EXCLUDED.vendor_access_token_enc,
         vendor_refresh_token_enc = EXCLUDED.vendor_refresh_token_enc,
         updated_at = now()`,
      [user.id, accessTokenEnc, refreshTokenEnc]
    );

    return rows[0];
  });

  return {
    sessionToken,
    csrfToken,
    sessionId: row.id,
    expiresAt: row.expires_at,
  };
}

export async function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const rawToken = cookies[config.auth.cookieName];
  if (!rawToken) return null;

  const tokenHash = sha256Hex(rawToken);
  const { rows } = await query(
    `SELECT ${SESSION_COLUMNS}
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      LIMIT 1`,
    [tokenHash]
  );
  if (!rows[0]) return null;

  // A lightweight activity timestamp is useful for security review. Avoid a
  // write on every request by only refreshing it when it is more than 5 min old.
  if (!rows[0].last_seen_at || Date.now() - new Date(rows[0].last_seen_at).getTime() > 5 * 60 * 1000) {
    query('UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1', [rows[0].session_id])
      .catch((err) => console.error('[auth] session heartbeat failed:', err.message));
  }

  return {
    sessionId: rows[0].session_id,
    csrfHash: rows[0].csrf_hash,
    expiresAt: rows[0].expires_at,
    user: publicUser(rows[0]),
  };
}

export async function getVendorTokenPair(session) {
  if (!session?.sessionId) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session is unavailable. Please sign in again.', {
      status: 401,
    });
  }

  const { rows } = await query(
    `SELECT s.vendor_access_token_enc, s.vendor_refresh_token_enc, s.user_id
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      LIMIT 1`,
    [session.sessionId]
  );

  const accessEncrypted = rows[0]?.vendor_access_token_enc;
  const refreshEncrypted = rows[0]?.vendor_refresh_token_enc;
  if (!accessEncrypted || !refreshEncrypted) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session is unavailable. Please sign in again.', {
      status: 401,
    });
  }

  try {
    const accessToken = decryptSecret(accessEncrypted, config.auth.tokenEncryptionKey);
    const refreshToken = decryptSecret(refreshEncrypted, config.auth.tokenEncryptionKey);
    if (!accessToken || !refreshToken) throw new Error('empty token');
    return {
      userId: rows[0].user_id,
      accessToken,
      refreshToken,
    };
  } catch {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session is unavailable. Please sign in again.', {
      status: 401,
    });
  }
}

export async function getVendorAccessToken(session) {
  return (await getVendorTokenPair(session)).accessToken;
}

export async function replaceVendorTokens(session, tokens) {
  if (!session?.sessionId || !session?.user?.id) {
    throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session is unavailable. Please sign in again.', {
      status: 401,
    });
  }
  const accessTokenEnc = encryptSecret(tokens.accessToken, config.auth.tokenEncryptionKey);
  const refreshTokenEnc = encryptSecret(tokens.refreshToken, config.auth.tokenEncryptionKey);
  await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE auth_sessions
          SET vendor_access_token_enc = $2,
              vendor_refresh_token_enc = $3
        WHERE id = $1
          AND revoked_at IS NULL
          AND expires_at > now()`,
      [session.sessionId, accessTokenEnc, refreshTokenEnc]
    );
    if (updated.rowCount !== 1) {
      throw new AppError('VENDOR_SESSION_EXPIRED', 'Vendor session is unavailable. Please sign in again.', {
        status: 401,
      });
    }
    await client.query(
      `INSERT INTO vendor_collector_credentials
         (user_id, vendor_access_token_enc, vendor_refresh_token_enc, updated_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT (user_id) DO UPDATE SET
         vendor_access_token_enc = EXCLUDED.vendor_access_token_enc,
         vendor_refresh_token_enc = EXCLUDED.vendor_refresh_token_enc,
         updated_at = now()`,
      [session.user.id, accessTokenEnc, refreshTokenEnc]
    );
  });
}
export async function requireAuthenticatedSession(req) {
  const session = await getSessionFromRequest(req);
  if (!session) throw new UnauthorizedError('Authentication required');
  req.auth = session;
  return session;
}

export function enforceCsrf(req, session) {
  if (!session) throw new UnauthorizedError('Authentication required');
  const header = req.headers['x-csrf-token'];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || !constantTimeEqual(sha256Hex(provided), session.csrfHash)) {
    throw new ForbiddenError('Invalid CSRF token');
  }
}

export function isPublicApiPath(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return path === '/api/v1/health'
    || path === '/api/v1/ping'
    || path === '/api/v1/auth/login';
}

export function authorizeApiPath(req, pathname, session) {
  if (!session) return;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const role = session.user.role;
  const isPathOrChild = (base) => path === base || path.startsWith(`${base}/`);

  if (path === '/api/v1/auth/me' || path === '/api/v1/auth/logout') return;

  if (isPathOrChild('/api/v1/clients') || isPathOrChild('/api/v1/audit-logs')) {
    if (role !== 'master_admin') throw new ForbiddenError();
    return;
  }

  if (isPathOrChild('/api/v1/users')) {
    if (!['master_admin', 'client_admin'].includes(role)) throw new ForbiddenError();
    return;
  }

  // These endpoints have no client/machine scope in the existing schema yet,
  // so fail closed rather than exposing global notification data to tenants.
  if (isPathOrChild('/api/v1/alert-thresholds')
    || isPathOrChild('/api/v1/notification-preferences')
    || isPathOrChild('/api/v1/notification-recipients')
    || isPathOrChild('/api/v1/notifications')
    || isPathOrChild('/api/v1/alerts/temperature')) {
    if (role !== 'master_admin') throw new ForbiddenError();
  }
}

export function applyDataScope(req, session) {
  if (!session) return;
  const role = session.user.role;
  if (role === 'master_admin') return;

  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;

  // Session introspection and vendor proxying are already authorized by the
  // signed-in session/vendor token. They must remain usable before a vendor
  // account has been explicitly mapped to a local Client/Machine.
  if (path === '/api/v1/auth/me'
    || path === '/api/v1/auth/logout'
    || path === '/api/v1/auth/refresh'
    || path === '/api/v1/vendor-devices'
    || path === '/api/v1/vendor-devices/history'
    || path === '/api/v1/graphs'
    || path === '/api/v1/graphs/food-waste'
    || path === '/api/v1/reports') {
    return;
  }

  if (role === 'client_admin') {
    if (!session.user.clientId) throw new ForbiddenError('Account is not linked to a client');
    url.searchParams.set('clientId', session.user.clientId);
  } else if (role === 'user') {
    if (!session.user.machineId) throw new ForbiddenError('Account is not linked to a machine');
    url.searchParams.set('machineId', session.user.machineId);
    if (session.user.clientId) url.searchParams.set('clientId', session.user.clientId);
  }
  req.url = `${url.pathname}${url.search}`;
}

export async function revokeCurrentSession(req) {
  const cookies = parseCookies(req);
  const rawToken = cookies[config.auth.cookieName];
  if (!rawToken) return;
  await query(
    `UPDATE auth_sessions SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256Hex(rawToken)]
  );
}
