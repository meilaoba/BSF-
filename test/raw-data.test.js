import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/raw-data.js'), 'utf8');
const sandbox = {
  console,
  bsfEscapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  isClientScopedRole() { return true; },
  isUserRole() { return false; },
  scopedDevices() { return []; },
  scopedClientNames() { return []; },
  clientScopeBadge() { return ''; },
  rawDataFilters: { client: '', device: '', start: '', end: '' },
  RAW_DATA_PAGE_SIZE: 30,
  rawDataPage: 1,
  currentPage: 'raw-data',
  document: { getElementById() { return null; } }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'raw-data.js' });

const sampleRow = {
  recordedAt: '2026-10-28 14:58:46',
  device: 'KW-300',
  deviceState: 'Running',
  weight: 10.8,
  temperature: 40.9,
  humidity: 0.2,
  operatingStatus: 'Running',
  totalAddMaterial: 100,
  hotPlateTemp: 38.7
};

test('client and user raw tables render six columns instead of CSS-hiding extra columns', () => {
  const html = sandbox.rawDataCompactTableMarkup([sampleRow]);
  assert.equal((html.match(/<th /g) || []).length, 6);
  assert.match(html, />Recorded At</);
  assert.match(html, />Device</);
  assert.match(html, />State</);
  assert.match(html, />Weight\(kg\)</);
  assert.match(html, />Temp\(°C\)</);
  assert.match(html, />Hum\(%\)</);
  assert.doesNotMatch(html, />Operating</);
  assert.doesNotMatch(source, /nth-child/);
});

test('master admin keeps the full raw table', () => {
  const html = sandbox.rawDataFullTableMarkup([sampleRow]);
  assert.match(html, />Operating</);
  assert.match(html, />Hot Plate Temp\(°C\)</);
  assert.match(html, />Total Add\(kg\)</);
});

test('raw data uses saved samples and paginates exports instead of requesting 5000 rows', () => {
  assert.match(source, /BSF_LOAD_RAW_SAMPLES/);
  assert.match(source, /rawDataLoadAllForExport/);
  assert.doesNotMatch(source, /pageSize\s*:\s*5000/);
  assert.doesNotMatch(source, /BSF_LOAD_VENDOR_HISTORY/);
});

test('raw data request preserves the selected start and end times', () => {
  sandbox.rawDataFilters = {
    client:'',
    device:'',
    start:'2026-10-28T00:00',
    end:'2026-10-29T00:00'
  };
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.rawDataHistoryRange())), {
    start:'2026-10-28T00:00',
    end:'2026-10-29T00:00'
  });
  const options = sandbox.rawDataRequestOptions(1, 30);
  assert.equal(options.start, '2026-10-28T00:00');
  assert.equal(options.end, '2026-10-29T00:00');
});

test('raw data uses a 60-day maximum history window', () => {
  assert.match(source, /rawDataAddDays\(rawDataFilters\.end, -59\)/);
  assert.match(source, /rawDataAddDays\(end, -59\)/);
});
