import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptSecret, encryptSecret, md5Upper } from '../src/lib/crypto.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

test('password MD5 matches the vendor contract', () => {
  assert.equal(md5Upper('123456'), 'E10ADC3949BA59ABBE56E057F20F883E');
});

test('vendor tokens encrypt and decrypt', () => {
  const encrypted = encryptSecret('sample.jwt.token', KEY);
  assert.notEqual(encrypted, 'sample.jwt.token');
  assert.equal(decryptSecret(encrypted, KEY), 'sample.jwt.token');
});

test('tampered token ciphertext is rejected', () => {
  const encrypted = encryptSecret('sample.jwt.token', KEY);
  const parts = encrypted.split('.');
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  const tampered = parts.join('.');
  assert.throws(() => decryptSecret(tampered, KEY));
});
