import { Readable } from 'node:stream';

const MAX_BODY_BYTES = 256 * 1024; // 256 KB is plenty for JSON API calls.

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Cache-Control': 'no-store',
};

export function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload ?? {});
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(body);
}

export function sendOk(res, data, meta) {
  sendJson(res, 200, meta ? { ok: true, data, meta } : { ok: true, data });
}

export function sendError(res, err) {
  const status = Number.isInteger(err?.status) ? err.status : 500;
  const code = err?.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
  const isServerError = status >= 500;

  if (isServerError) {
    console.error(`[api] ${code}:`, err?.message || err);
  }

  sendJson(res, status, {
    ok: false,
    error: {
      code,
      message: isServerError && !err?.code
        ? 'Internal server error'
        : err?.message || 'Request failed',
      ...(err?.details ? { details: err.details } : {}),
    },
  });
}

export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('Request body too large');
      err.code = 'PAYLOAD_TOO_LARGE';
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  if (size === 0) return {};

  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const err = new Error('Request body must be a JSON object');
      err.code = 'VALIDATION_ERROR';
      err.status = 422;
      throw err;
    }
    return parsed;
  } catch (parseErr) {
    if (parseErr.code === 'VALIDATION_ERROR') throw parseErr;
    const err = new Error('Malformed JSON body');
    err.code = 'INVALID_JSON';
    err.status = 400;
    throw err;
  }
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim().slice(0, 64);
  }
  return (req.socket?.remoteAddress || '').slice(0, 64);
}

export function applyCors(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return;

  const allowAll = allowedOrigins.includes('*');
  const isAllowed = allowAll || allowedOrigins.includes(origin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-csrf-token, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    if (!allowAll) res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

/**
 * Minimal dependency-free router: matches METHOD + exact path.
 */
export class Router {
  #routes = [];

  add(method, path, handler) {
    this.#routes.push({ method, path, handler });
    return this;
  }

  get(path, handler) { return this.add('GET', path, handler); }
  post(path, handler) { return this.add('POST', path, handler); }
  put(path, handler) { return this.add('PUT', path, handler); }
  patch(path, handler) { return this.add('PATCH', path, handler); }
  delete(path, handler) { return this.add('DELETE', path, handler); }

  match(method, pathname) {
    // Normalise a trailing slash so /api/v1/health and /api/v1/health/ match.
    const normalised = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const pathOnly = this.#routes.find(
      (r) => r.method === method && (r.path === normalised || r.path === pathname)
    );
    if (pathOnly) return pathOnly;

    // Allow a trailing sub-path (e.g. /api/v1/notifications/logs/123 -> logs handler).
    const prefix = this.#routes.find(
      (r) => r.method === method && normalised.startsWith(`${r.path}/`)
    );
    return prefix ?? null;
  }

  get routeCount() {
    return this.#routes.length;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { Readable };
