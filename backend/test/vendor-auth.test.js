import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.VENDOR_AUTH_ENABLED ||= 'false';
process.env.AUTH_REQUIRED ||= 'false';

const { mapVendorRole } = await import('../src/providers/vendor-auth.js');

test('vendor account types map to the agreed BSF roles', () => {
  assert.equal(mapVendorRole(1), 'master_admin');
  assert.equal(mapVendorRole(2), 'client_admin');
  assert.equal(mapVendorRole(3), 'user');
});

test('unknown vendor account types fail closed', () => {
  assert.equal(mapVendorRole(0), null);
  assert.equal(mapVendorRole(4), null);
  assert.equal(mapVendorRole('admin'), null);
});
