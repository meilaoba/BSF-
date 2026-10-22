import { config } from '../config.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { constantTimeEqual } from '../lib/crypto.js';

export function hasValidApiKey(req) {
  if (!config.internalApiKey) return false;
  const provided = req.headers['x-api-key'];
  const token = Array.isArray(provided) ? provided[0] : provided;
  return Boolean(token) && constantTimeEqual(String(token), config.internalApiKey);
}

/**
 * Shared-secret guard for state-changing endpoints.
 *
 * The key is only enforced when INTERNAL_API_KEY is non-empty, so local
 * development stays frictionless. In production the value is read from
 * /etc/bsf-backend.env and never committed.
 */
export function requireApiKey(req) {
  // A signed-in Master Admin can use the destructive/administrative endpoints.
  // Client and machine users must never inherit this access merely because they
  // have a valid session.
  if (req.auth?.user?.role === 'master_admin') return;
  if (hasValidApiKey(req)) return;

  if (!config.internalApiKey) {
    if (req.auth?.user) throw new ForbiddenError();
    if (config.env === 'production') {
      console.warn(
        '[auth] INTERNAL_API_KEY is empty in production - write endpoints are unprotected.'
      );
    }
    return;
  }

  throw new UnauthorizedError('Invalid or missing API key');
}
