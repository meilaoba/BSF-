import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/routes/directory.js'), 'utf8');
const start = source.indexOf("router.post('/api/v1/clients'");
const end = source.indexOf("router.put('/api/v1/clients'", start);
const createClientBlock = source.slice(start, end);
const updateStart = source.indexOf("router.put('/api/v1/clients'");
const updateEnd = source.indexOf("router.delete('/api/v1/clients'", updateStart);
const updateClientBlock = source.slice(updateStart, updateEnd);

test('client creation SQL and parameter list stay aligned', () => {
  assert.match(createClientBlock, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7\)/);
  assert.doesNotMatch(createClientBlock, /vendorDeviceId/);
});

test('client updates can persist site GHG formula overrides', () => {
  assert.match(updateClientBlock, /metadata = COALESCE\(metadata \|\| \$9::jsonb, metadata\)/);
  assert.match(updateClientBlock, /JSON\.stringify\(metadata\)/);
});
