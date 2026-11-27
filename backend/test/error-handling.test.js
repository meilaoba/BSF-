import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const {
  AppError,
  ProviderError,
  ValidationError,
  isAppError,
} = await import('../src/lib/errors.js');

test('recognizes local application errors', () => {
  assert.equal(isAppError(new AppError('TEST', 'test', { status: 400 })), true);
  assert.equal(isAppError(new ValidationError('invalid')), true);
  assert.equal(isAppError(new ProviderError('VENDOR_REJECTED', 'rejected')), true);
});

test('recognizes application errors loaded from another module instance', () => {
  const foreignError = Object.assign(new Error('foreign'), {
    code: 'VENDOR_PASSWORD_INVALID',
    status: 400,
    details: { vendorCode: 4003 },
  });
  assert.equal(foreignError instanceof AppError, false);
  assert.equal(isAppError(foreignError), true);
});

test('does not treat ordinary runtime failures as application errors', () => {
  assert.equal(isAppError(new TypeError('bad code')), false);
  assert.equal(isAppError({ code: 'FAKE', status: 200 }), false);
  assert.equal(isAppError(null), false);
});
