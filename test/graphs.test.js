import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as metrics from '../src/shared/metrics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/graphs.js'), 'utf8');
const pageContainer = { innerHTML: '' };
const sandbox = {
  window:{ BSF_METRICS:metrics, BSF_API_CONFIG:{ enabled:true } },
  console,
  document:{ getElementById(id){ return id === 'page-content' ? pageContainer : null; } },
  currentPage:'graphs',
  currentRole:'admin',
  scopedClientNames(){ return ['Client A']; },
  scopedDevices(){ return [{ id:'KW-001', client:'Client A' }]; },
  scopedClientNames(){ return ['Client A']; },
  isClientScopedRole(){ return false; },
  isUserRole(){ return false; },
  clientScopeBadge(){ return ''; },
  setTimeout(callback){ callback(); return 0; },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename:'graphs.js' });

test('graph period parameters request real daily, monthly and yearly API buckets', () => {
  vm.runInContext("graphFilters={client:'Client A',machine:'KW-001',start:'2026-10-15',end:'2026-10-15'}", sandbox);
  vm.runInContext("graphPeriods={foodWaste:'daily',ghg:'daily',temp:'daily',energy:'daily'}", sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('graphApiParams()', sandbox))), {
    period:'daily', clientId:'Client A', machineId:'KW-001', year:2026, month:10, date:'2026-10-15'
  });

  vm.runInContext("graphFilters={client:'Client A',machine:'',start:'2026-10-01',end:'2026-10-31'}", sandbox);
  vm.runInContext("graphPeriods={foodWaste:'monthly',ghg:'monthly',temp:'monthly',energy:'monthly'}", sandbox);
  const monthly = vm.runInContext('graphApiParams()', sandbox);
  assert.equal(monthly.period, 'monthly');
  assert.equal(monthly.year, 2026);
  assert.equal(monthly.month, 10);

  vm.runInContext("graphFilters={client:'Client A',machine:'',start:'2026-01-01',end:'2026-12-31'}", sandbox);
  vm.runInContext("graphPeriods={foodWaste:'yearly',ghg:'yearly',temp:'yearly',energy:'yearly'}", sandbox);
  assert.equal(vm.runInContext('graphApiParams()', sandbox).period, 'yearly');
});

test('graph errors distinguish missing account linkage from an empty dataset', () => {
  assert.equal(
    vm.runInContext("graphErrorMessage({code:'VENDOR_ACCOUNT_SCOPE_REQUIRED',message:'raw backend message'})", sandbox),
    'This account is not linked to a client or machine. Please contact an administrator.'
  );
  assert.equal(
    vm.runInContext("graphErrorMessage({code:'NETWORK_ERROR',message:'fetch failed'})", sandbox),
    'Chart data service is unavailable. Please try again.'
  );
});

test('a failed graph request is rendered once instead of starting a fetch loop', async () => {
  let calls = 0;
  sandbox.fetch = async () => {
    calls += 1;
    return {
      ok:false,
      status:403,
      json:async () => ({ error:{ code:'VENDOR_ACCOUNT_SCOPE_REQUIRED', message:'No scope' } })
    };
  };
  pageContainer.innerHTML = '';
  vm.runInContext("graphApiData=null;graphApiKey='';graphApiRequestKey='';graphApiError='';graphApiFailedKey='';graphApiLoading=false;graphFilters={client:'',machine:'',start:'2026-10-01',end:'2026-10-31'};graphPeriods={foodWaste:'monthly',ghg:'monthly',temp:'monthly',energy:'monthly'};", sandbox);
  await vm.runInContext('loadGraphApiData()', sandbox);
  assert.equal(calls, 1);
  assert.match(pageContainer.innerHTML, /This account is not linked to a client or machine/);
});

test('graph requests retry transient failures and then recover', async () => {
  let calls = 0;
  sandbox.fetch = async () => {
    calls += 1;
    if(calls < 3) throw new TypeError('network unavailable');
    return {
      ok:true,
      status:200,
      json:async () => ({ ok:true, data:{ items:[], summary:{ pointCount:0 } } })
    };
  };
  const result = await vm.runInContext(
    "graphFetchJson('/api/v1/graphs', {})",
    sandbox
  );
  assert.equal(calls, 3);
  assert.equal(result.summary.pointCount, 0);
});

test('line chart keeps the full axis but never plots future or missing buckets', () => {
  sandbox.rows = [
    { label:'00:00', value:1 },
    { label:'01:00', value:2 },
    { label:'02:00', value:null },
    { label:'03:00', value:4 },
    { label:'04:00', value:null },
  ];
  const svg = vm.runInContext("buildLineChartSvg(rows, 'value', '#3b82f6')", sandbox);
  assert.equal((svg.match(/<circle/g) || []).length, 3);
  assert.equal((svg.match(/<path/g) || []).length, 2);
  assert.match(svg, /viewBox="0 0 1000 180"/);
  assert.match(svg, /04:00/);
});

test('line chart renders numeric y-axis labels including negative values', () => {
  sandbox.rows = [
    { label:'15:00', value:-0.0634520548 },
    { label:'16:00', value:-0.6184520548 },
  ];
  const svg = vm.runInContext("buildLineChartSvg(rows, 'value', '#10b981')", sandbox);
  const axisLabels = Array.from(svg.matchAll(/data-axis-label="true"[^>]*>([^<]+)</g), (match) => match[1]);
  assert.ok(axisLabels.length >= 4);
  assert.ok(axisLabels.includes('0'));
  assert.ok(axisLabels.includes('-0.6'));
  assert.match(svg, /stroke="#64748b" stroke-width="1"/);
});

test('daily x-axis uses short labels and avoids the forced overlapping final tick', () => {
  sandbox.rows = Array.from({ length:24 }, function(_, hour){
    return {
      label:'2026-10-28 ' + String(hour).padStart(2, '0') + ':00',
      value:hour === 23 ? 1 : null,
    };
  });
  const svg = vm.runInContext("buildLineChartSvg(rows, 'value', '#3b82f6')", sandbox);
  const labels = Array.from(svg.matchAll(/data-x-axis-label="true"[^>]*>([^<]+)</g), (match) => match[1]);
  assert.ok(labels.length <= 7);
  assert.ok(labels.includes('23:00'));
  assert.ok(labels.every((label) => /^\d{2}:\d{2}$/.test(label)));
});

test('graph page uses the server analytics result rather than browser history fallback', () => {
  assert.match(source, /graphFetchJson\('\/api\/v1\/graphs'/);
  assert.match(source, /credentials:'include'/);
  assert.match(source, /X-BSF-Client-Instance/);
  assert.doesNotMatch(source, /BSF_LOAD_VENDOR_HISTORY/);
  assert.doesNotMatch(source, /rawDataRows/);
});
