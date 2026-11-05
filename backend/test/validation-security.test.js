import test from 'node:test';
import assert from 'node:assert/strict';
import {
  optionalDisplayText,
  optionalPhone,
  requireDisplayText,
  requirePhone,
} from '../src/lib/validate.js';

test('display text accepts normal human-readable names', () => {
  assert.equal(requireDisplayText('Harbour View Hotel', 'name'), 'Harbour View Hotel');
  assert.equal(requireDisplayText('陳記 & Co.', 'name'), '陳記 & Co.');
  assert.equal(optionalDisplayText(undefined, 'name'), null);
  assert.equal(optionalDisplayText('  Kitchen A  ', 'name'), 'Kitchen A');
});

test('display text rejects HTML markup and control characters', () => {
  for (const value of [
    '<img src=x onerror=alert(1)>',
    'Client <script>alert(1)</script>',
    'Client\nInjected',
    'Client\u0000Injected',
  ]) {
    assert.throws(
      () => requireDisplayText(value, 'name'),
      (error) => error.code === 'VALIDATION_ERROR',
      value
    );
  }
});

test('phone validation infers Hong Kong and mainland China country codes', () => {
  assert.equal(requirePhone('91234567', 'mobile'), '+85291234567');
  assert.equal(requirePhone('13812345678', 'mobile'), '+8613812345678');
  assert.equal(requirePhone('+8613812345678', 'mobile'), '+8613812345678');
  assert.equal(requirePhone('+852 9123 4567', 'mobile'), '+85291234567');
  assert.equal(optionalPhone('', 'mobile'), null);
});

test('phone validation rejects placeholders, malformed values and unknown bare formats', () => {
  for (const value of [
    '1111111',
    '+1111111',
    '+86 138-1234-5678',
    '123456',
    '1234567890',
    '1234567890123456',
  ]) {
    assert.throws(
      () => requirePhone(value, 'mobile'),
      (error) => error.code === 'VALIDATION_ERROR',
      value
    );
  }
});
