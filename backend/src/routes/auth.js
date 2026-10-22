import { config } from '../config.js';
import { audit, query } from '../db.js';
import { AppError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { clientIp, readJsonBody, sendJson, sendOk } from '../lib/http.js';
import { requireString } from '../lib/validate.js';
import { loginWithVendor } from '../providers/vendor-auth.js';
import {
  authCookies,
  clearAuthCookies,
  createSession,
  parseCookies,
  revokeCurrentSession,
} from '../middleware/session.js';

const loginState = new Map();

function rateKey(scope, value) {
  return `${scope}:${value}`;
}

function nowMs() {
  return Date.now();
}

function currentEntry(key, windowMs) {
  const current = loginState.get(key);
  if (!current) return null;
  if (current.blockedUntil > nowMs()) return current;
  if (current.firstAt + windowMs <= nowMs()) {
    loginState.delete(key);
    return null;
  }
  return current;
}

function secondsUntil(entry) {
  return Math.max(1, Math.ceil((entry.blockedUntil - nowMs()) / 1000));
}

function checkLoginRate(ip, userName) {
  const windowMs = config.auth.loginWindowSeconds * 1000;
  const account = currentEntry(rateKey('account', `${ip}:${userName.toLowerCase()}`), windowMs);
  if (account?.blockedUntil > nowMs()) {
    throw new AppError('LOGIN_RATE_LIMITED', 'Too many sign-in attempts. Try again later.', {
      status: 429,
      details: { retryAfterSeconds: secondsUntil(account) },
    });
  }

  const source = currentEntry(rateKey('ip', ip), windowMs);
  if (source?.blockedUntil > nowMs()) {
    throw new AppError('LOGIN_RATE_LIMITED', 'Too many sign-in attempts. Try again later.', {
      status: 429,
      details: { retryAfterSeconds: secondsUntil(source) },
    });
  }
}

function recordLoginFailure(ip, userName) {
  const windowMs = config.auth.loginWindowSeconds * 1000;
  const accountKey = rateKey('account', `${ip}:${userName.toLowerCase()}`);
  const ipKey = rateKey('ip', ip);
  const timestamp = nowMs();

  const account = currentEntry(accountKey, windowMs) || { count: 0, firstAt: timestamp, blockedUntil: 0 };
  account.count += 1;
  if (account.count >= config.auth.loginMaxAttempts) {
    account.blockedUntil = timestamp + config.auth.loginLockSeconds * 1000;
  }
  loginState.set(accountKey, account);

  const source = currentEntry(ipKey, windowMs) || { count: 0, firstAt: timestamp, blockedUntil: 0 };
  source.count += 1;
  if (source.count >= config.auth.ipMaxAttempts) {
    source.blockedUntil = timestamp + config.auth.loginLockSeconds * 1000;
  }
  loginState.set(ipKey, source);

  return account.count === config.auth.loginMaxAttempts || source.count === config.auth.ipMaxAttempts;
}

function clearLoginFailures(ip, userName) {
  loginState.delete(rateKey('account', `${ip}:${userName.toLowerCase()}`));
}

function pruneLoginState() {
  if (loginState.size < 5000) return;
  const timestamp = nowMs();
  for (const [key, entry] of loginState) {
    if (entry.blockedUntil <= timestamp && entry.firstAt + config.auth.loginWindowSeconds * 1000 <= timestamp) {
      loginState.delete(key);
    }
  }
  // Defensive bound for memory usage under distributed low-rate abuse.
  while (loginState.size > 10000) {
    loginState.delete(loginState.keys().next().value);
  }
}

function assertTrustedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin || config.corsAllowedOrigins.includes('*')) return;
  if (config.corsAllowedOrigins.includes(origin)) return;

  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.headers.host;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.socket?.encrypted ? 'https' : 'http');
  if (host && origin === `${protocol}://${host}`) return;
  throw new ForbiddenError('Untrusted request origin');
}

async function findExistingUser(vendorUserId) {
  const { rows } = await query('SELECT * FROM users WHERE vendor_user_id = $1 LIMIT 1', [vendorUserId]);
  return rows[0] || null;
}

async function resolveUniqueContact(kind, value, existingUserId) {
  if (!value) return null;
  const column = kind === 'email' ? 'lower(email)' : 'phone';
  const { rows } = await query(
    `SELECT id FROM users WHERE ${column} = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [kind === 'email' ? String(value).toLowerCase() : String(value), existingUserId]
  );
  return rows[0] ? null : String(value).slice(0, kind === 'email' ? 254 : 40);
}

async function upsertVendorUser(vendorUser) {
  const existing = await findExistingUser(vendorUser.id);
  if (existing?.status === 'disabled') {
    throw new AppError('ACCOUNT_DISABLED', 'This account has been disabled', { status: 403 });
  }
  if (vendorUser.userState !== null && vendorUser.userState !== 1) {
    throw new AppError('ACCOUNT_DISABLED', 'This account is not active', { status: 403 });
  }

  const email = await resolveUniqueContact('email', vendorUser.email, existing?.id || null);
  const phone = await resolveUniqueContact('phone', vendorUser.mobile, existing?.id || null);
  const vendorMetadata = {
    vendor: {
      id: vendorUser.id,
      type: vendorUser.type,
      parentId: vendorUser.parentId,
      parentName: vendorUser.parentName,
      userState: vendorUser.userState,
      userIcon: vendorUser.userIcon,
      createTime: vendorUser.createTime,
    },
  };

  const { rows } = await query(
    `INSERT INTO users
       (vendor_user_id, vendor_type, vendor_username, email, phone, full_name, role,
        status, last_login_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active',now(),$8)
     ON CONFLICT (vendor_user_id) WHERE vendor_user_id IS NOT NULL
     DO UPDATE SET
       vendor_type = EXCLUDED.vendor_type,
       vendor_username = EXCLUDED.vendor_username,
       email = COALESCE(EXCLUDED.email, users.email),
       phone = COALESCE(EXCLUDED.phone, users.phone),
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role,
       status = 'active',
       last_login_at = now(),
       metadata = COALESCE(users.metadata, '{}'::jsonb) || EXCLUDED.metadata
     RETURNING *`,
    [
      vendorUser.id,
      vendorUser.type,
      vendorUser.userName,
      email,
      phone,
      vendorUser.userName,
      vendorUser.role,
      JSON.stringify(vendorMetadata),
    ]
  );
  return rows[0];
}

export function registerAuthRoutes(router) {
  router.post('/api/v1/auth/login', async (req, res) => {
    assertTrustedOrigin(req);

    if (!config.auth.enabled) {
      throw new AppError('AUTH_NOT_CONFIGURED', 'Authentication is not configured', { status: 503 });
    }
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    if (config.auth.cookieSecure && req.socket?.encrypted !== true && forwardedProto !== 'https') {
      throw new AppError('HTTPS_REQUIRED', 'Secure sign-in requires HTTPS', { status: 503 });
    }

    const body = await readJsonBody(req);
    const userName = requireString(body.userName ?? body.email, 'userName', { max: 200 });
    const password = body.password ?? body.userPass;
    if (typeof password !== 'string' || password.length === 0 || password.length > 256) {
      throw new ValidationError('`password` is required and must be at most 256 characters');
    }
    const ip = clientIp(req);

    pruneLoginState();
    checkLoginRate(ip, userName);

    let vendorResult;
    try {
      vendorResult = await loginWithVendor(userName, password);
    } catch (err) {
      const isCredentialFailure = err?.code === 'INVALID_CREDENTIALS';
      const blocked = isCredentialFailure ? recordLoginFailure(ip, userName) : false;
      await audit({
        actorType: 'system',
        actorLabel: userName.slice(0, 120),
        action: blocked ? 'auth.login.locked' : 'auth.login.failed',
        entityType: 'auth',
        metadata: { code: err?.code || 'AUTH_FAILED', severity: blocked ? 'critical' : 'warning' },
        ip,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
      });
      if (blocked) console.warn(`[security] login lockout triggered for source ${ip}`);
      throw err;
    }

    const user = await upsertVendorUser(vendorResult.vendorUser);
    const session = await createSession({
      user,
      vendorTokens: { token: vendorResult.token, refreshToken: vendorResult.refreshToken },
      req,
    });
    clearLoginFailures(ip, userName);

    await audit({
      actorType: 'user',
      actorId: user.id,
      actorLabel: vendorResult.vendorUser.userName,
      action: 'auth.login.success',
      entityType: 'session',
      entityId: session.sessionId,
      metadata: { role: user.role, vendorType: vendorResult.vendorUser.type },
      ip,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    });

    res.setHeader('Set-Cookie', authCookies(session.sessionToken, session.csrfToken));
    sendJson(res, 200, {
      ok: true,
      data: {
        user: {
          id: user.id,
          userName: vendorResult.vendorUser.userName,
          fullName: vendorResult.vendorUser.userName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          clientId: user.client_id,
          machineId: user.machine_id,
          avatarUrl: vendorResult.vendorUser.userIcon,
          vendorType: vendorResult.vendorUser.type,
          vendorParentId: vendorResult.vendorUser.parentId,
        },
        sessionExpiresAt: session.expiresAt,
      },
    });
  });

  router.get('/api/v1/auth/me', async (req, res) => {
    if (!req.auth) throw new AppError('UNAUTHORIZED', 'Authentication required', { status: 401 });
    const cookies = parseCookies(req);
    sendOk(res, {
      user: req.auth.user,
      csrfToken: cookies[config.auth.csrfCookieName] || null,
      sessionExpiresAt: req.auth.expiresAt,
    });
  });

  router.post('/api/v1/auth/logout', async (req, res) => {
    await revokeCurrentSession(req);
    await audit({
      actorType: req.auth?.user ? 'user' : 'system',
      actorId: req.auth?.user?.id || null,
      actorLabel: req.auth?.user?.userName || null,
      action: 'auth.logout',
      entityType: 'session',
      entityId: req.auth?.sessionId || null,
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    });
    res.setHeader('Set-Cookie', clearAuthCookies());
    sendOk(res, { loggedOut: true });
  });

  router.post('/api/v1/auth/refresh', async () => {
    // The vendor has not supplied its refresh endpoint yet. Fail closed rather
    // than pretending the session was refreshed.
    throw new AppError('REFRESH_NOT_CONFIGURED', 'Token refresh is not configured yet', { status: 501 });
  });
}
