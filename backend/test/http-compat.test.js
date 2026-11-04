import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const { normalizeDirectoryDetailRequest } = await import('../src/lib/http.js');

test('directory detail paths remain compatible with older cached frontends', () => {
  const url = normalizeDirectoryDetailRequest(
    new URL('https://bsf.test/api/v1/users/ca4bae93-76b3-4090-89ad-84b52cddbe11'),
    'DELETE'
  );
  assert.equal(url.pathname, '/api/v1/users');
  assert.equal(url.searchParams.get('id'), 'ca4bae93-76b3-4090-89ad-84b52cddbe11');
});

test('directory detail compatibility is limited to UUID writes', () => {
  const readUrl = normalizeDirectoryDetailRequest(
    new URL('https://bsf.test/api/v1/users/ca4bae93-76b3-4090-89ad-84b52cddbe11'),
    'GET'
  );
  assert.equal(readUrl.pathname, '/api/v1/users/ca4bae93-76b3-4090-89ad-84b52cddbe11');

  const invalid = normalizeDirectoryDetailRequest(
    new URL('https://bsf.test/api/v1/users/not-a-uuid'),
    'DELETE'
  );
  assert.equal(invalid.pathname, '/api/v1/users/not-a-uuid');
});
