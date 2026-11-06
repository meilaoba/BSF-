import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readPage = (name) => fs.readFileSync(path.join(root, 'src/ui/pages', name), 'utf8');

test('customer and machine filter placeholders use the requested copy', () => {
  for (const page of [
    'graphs.js',
    'raw-data.js',
    'alerts.js',
    'machines.js',
    'locations.js',
    'reports.js',
    'api.js',
  ]) {
    const source = readPage(page);
    assert.doesNotMatch(source, /All Clients/, page);
    if (page !== 'locations.js') assert.doesNotMatch(source, /All Machines|All Devices/, page);
  }

  assert.match(readPage('graphs.js'), /Select Customer/);
  assert.match(readPage('graphs.js'), /Select Machine/);
  assert.match(readPage('reports.js'), /Select Customer/);
  assert.match(readPage('reports.js'), /Select Machine/);
});
