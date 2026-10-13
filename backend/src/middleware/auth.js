import { config } from '../config.js';
import { UnauthorizedError } from '../lib/errors.js';

/**
 * Shared-secret guard for state-changing endpoints.
 *
 * The key is only enforced when INTERNAL_API_KEY is non-empty, so local
 * development stays frictionless. In production the value is read from
 * /etc/bsf-backend.env and never committed.
 */
export function requireApiKey(req) {
  if (!config.internalApiKey) {
    if (config.env === 'production') {
      console.warn(
        '[auth] INTERNAL_API_KEY is empty in production - write endpoints are unprotected.'
      );
    }
    return;
  }

  const provided = req.headers['x-api-key'];
  const token = Array.isArray(provided) ? provided[0] : provided;

  if (!token || !timingSafeEqual(String(token), config.internalApiKey)) {
    throw new UnauthorizedError();
  }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}