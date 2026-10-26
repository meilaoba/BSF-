import test from 'node:test';
import assert from 'node:assert/strict';
import {
  optionalDisplayText,
  requireDisplayText,
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