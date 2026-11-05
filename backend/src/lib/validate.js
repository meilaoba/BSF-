import { ValidationError } from './errors.js';

export function requireString(value, field, { min = 1, max = 2000 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new ValidationError(`\`${field}\` is required`, { field });
  }
  const v = value.trim();
  if (v.length > max) {
    throw new ValidationError(`\`${field}\` must be at most ${max} characters`, { field });
  }
  return v;
}

export function optionalString(value, field, { max = 2000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`\`${field}\` must be a string`, { field });
  }
  const v = value.trim();
  if (v.length > max) {
    throw new ValidationError(`\`${field}\` must be at most ${max} characters`, { field });
  }
  return v === '' ? null : v;
}

const DISPLAY_TEXT_DISALLOWED_RE = /[<>\u0000-\u001f\u007f]/;

function assertSafeDisplayText(value, field) {
  if (DISPLAY_TEXT_DISALLOWED_RE.test(value)) {
    throw new ValidationError(`\`${field}\` contains unsupported markup or control characters`, { field });
  }
  return value;
}

export function requireDisplayText(value, field, options = {}) {
  return assertSafeDisplayText(requireString(value, field, options), field);
}

export function optionalDisplayText(value, field, options = {}) {
  const normalized = optionalString(value, field, options);
  return normalized === null ? null : assertSafeDisplayText(normalized, field);
}

export function requireEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`\`${field}\` must be one of: ${allowed.join(', ')}`, { field });
  }
  return value;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function requireEmail(value, field = 'email') {
  const v = requireString(value, field, { max: 254 });
  if (!EMAIL_RE.test(v)) {
    throw new ValidationError(`\`${field}\` is not a valid email address`, { field });
  }
  return v.toLowerCase();
}

export function optionalEmail(value, field = 'email') {
  if (value === undefined || value === null || value === '') return null;
  return requireEmail(value, field);
}

/**
 * Normalises a phone number into E.164 (the format WhatsApp Cloud API requires).
 * A bare Hong Kong or mainland China number is inferred from its length and
 * prefix; every other bare number must be supplied with a country code.
 */
export function requirePhone(value, field = 'phone') {
  const raw = requireString(value, field, { max: 32 });
  const cleaned = raw.replace(/\s+/g, '');

  if (!/^\+?\d{6,15}$/.test(cleaned)) {
    throw new ValidationError(
      `\`${field}\` must contain only digits with an optional leading + and 6 to 15 digits`,
      { field }
    );
  }

  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (/^(\d)\1+$/.test(digits)) {
    throw new ValidationError(`\`${field}\` must be a real phone number, not repeated digits`, { field });
  }

  if (cleaned.startsWith('+')) return `+${digits}`;
  if (digits.length === 8) return `+852${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+86${digits}`;

  throw new ValidationError(
    `\`${field}\` requires a country code when its region cannot be inferred`,
    { field }
  );
}

export function optionalPhone(value, field = 'phone') {
  if (value === undefined || value === null || value === '') return null;
  return requirePhone(value, field);
}

export function optionalUuid(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new ValidationError(`\`${field}\` must be a UUID`, { field });
  }
  return v;
}

export function optionalInt(value, field, { min, max } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new ValidationError(`\`${field}\` must be an integer`, { field });
  }
  if (min !== undefined && n < min) {
    throw new ValidationError(`\`${field}\` must be >= ${min}`, { field });
  }
  if (max !== undefined && n > max) {
    throw new ValidationError(`\`${field}\` must be <= ${max}`, { field });
  }
  return n;
}

export function optionalNumber(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ValidationError(`\`${field}\` must be a number`, { field });
  }
  return n;
}

export function optionalBool(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ValidationError(`\`${field}\` must be a boolean`, { field });
}

export function optionalObject(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`\`${field}\` must be an object`, { field });
  }
  return value;
}

export function clampLimit(value, { def = 50, max = 200 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

export function clampOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
