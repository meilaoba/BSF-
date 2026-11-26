import test from 'node:test';
import assert from 'node:assert/strict';

import { createBackendApi } from '../src/api/backend.js';

test('module API sends unmanaged vendor deletion as a query parameter', async () => {
  const calls = [];
  const backend = createBackendApi({
    http: {
      delete(path, data) {
        calls.push({ path, data });
        return Promise.resolve({ deleted: true });
      },
    },
  });

  await backend.deleteVendorUser(53);

  assert.deepEqual(calls, [{
    path: '/vendor-users?vendorUserId=53',
    data: undefined,
  }]);
});
