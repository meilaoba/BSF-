import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('dynamic client and machine filters do not assemble user data as HTML', () => {
  for (const file of ['src/ui/pages/alerts.js', 'src/ui/pages/raw-data.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /(?:clientSelect|machineSelect|deviceSelect)\.innerHTML\s*=/, file);
    assert.match(source, /bsfReplaceSelectOptions\(/, file);
  }
});

test('notification center uses DOM text nodes and event listeners', () => {
  const source = read('src/ui/notifications.js');
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /onclick="openNotification/);
  assert.match(source, /addEventListener\('click', activate\)/);
});

test('client scope badge escapes persisted client names', () => {
  const state = read('src/ui/state.js');
  assert.match(state, /bsfEscapeHtml\(clientScopeName\(\)\)/);
});

test('machine and report filters escape persisted labels', () => {
  const machines = read('src/ui/pages/machines.js');
  const reports = read('src/ui/pages/reports.js');
  assert.match(machines, /machinePreviewEscape\(client\)/);
  assert.match(machines, /machinePreviewEscape\(dev\.id\)/);
  assert.match(reports, /bsfEscapeHtml\(client\)/);
  assert.match(reports, /bsfEscapeHtml\(dev\.id\)/);
});

test('client machine-account buttons no longer concatenate values into inline handlers', () => {
  const source = read('src/ui/pages/clients.js');
  assert.doesNotMatch(source, /onclick="openMachineAccount\(/);
  assert.match(source, /data-machine-id=/);
  assert.match(source, /addEventListener\('click'/);
});

test('CSV and Excel exports neutralize spreadsheet formula prefixes', () => {
  const raw = read('src/ui/pages/raw-data.js');
  const reports = read('src/ui/pages/reports.js');
  assert.match(raw, /bsfSpreadsheetSafeText\(value\)/);
  assert.match(reports, /bsfSpreadsheetSafeText\(value\)/);
  assert.match(reports, /bsfEscapeHtml\(bsfSpreadsheetSafeText\(value\)\)/);
});
test('spreadsheet sanitizer neutralizes text formula prefixes only', () => {
  const sandbox = {};
  vm.runInNewContext(read('src/ui/state.js'), sandbox, { filename: 'state.js' });
  assert.equal(sandbox.bsfSpreadsheetSafeText('=2+2'), "'=2+2");
  assert.equal(sandbox.bsfSpreadsheetSafeText(' +SUM(A1:A2)'), "' +SUM(A1:A2)");
  assert.equal(sandbox.bsfSpreadsheetSafeText('@cmd'), "'@cmd");
  assert.equal(sandbox.bsfSpreadsheetSafeText('-2+3'), "'-2+3");
  assert.equal(sandbox.bsfSpreadsheetSafeText(-2), '-2');
  assert.equal(sandbox.bsfSpreadsheetSafeText('Normal text'), 'Normal text');
});
