import crypto from 'node:crypto';

const AES_VERSION = 'v1';

export function md5Upper(value) {
  return crypto.createHash('md5').update(String(value), 'utf8').digest('hex').toUpperCase();
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function decodeKey(keyMaterial) {
  const value = String(keyMaterial || '').trim();
  let key;

  if (/^[0-9a-f]{64}$/i.test(value)) {
    key = Buffer.from(value, 'hex');
  } else {
    key = Buffer.from(value, 'base64');
  }

  if (key.length !== 32) {
    throw new Error('AUTH_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

export function validateEncryptionKey(keyMaterial) {
  decodeKey(keyMaterial);
  return true;
}

/**
 * AES-256-GCM keeps vendor tokens encrypted at rest. The random IV is stored
 * with the ciphertext and payloads are versioned so the format can evolve.
 */
export function encryptSecret(plaintext, keyMaterial) {
  if (!plaintext) return null;
  const key = decodeKey(keyMaterial);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [AES_VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(payload, keyMaterial) {
  if (!payload) return null;
  const parts = String(payload).split('.');
  if (parts.length !== 4 || parts[0] !== AES_VERSION) {
    throw new Error('Unsupported encrypted secret format.');
  }

  const key = decodeKey(keyMaterial);
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
