import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as metrics from '../src/shared/metrics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/reports.js'), 'utf8');
let lastDownload = null;
const sandbox = {
  console,
  window:{ BSF_METRICS:metrics, BSF_API_CONFIG:{ enabled:true } },
  document:{
    getElementById(){ return null; },
    createElement(){ return { click(){}, remove(){}, style:{} }; },
    body:{ appendChild(){} },
  },
  setInterval(){ return 0; },
  clearTimeout(){},
  setTimeout(){ return 0; },
  devices:[],
  rawDataRows:[],
  currentPage:'reports',
  scopedDevices(){ return []; },
  isUserRole(){ return false; },
  isClientScopedRole(){ return sandbox.clientScoped === true; },
  bsfEscapeHtml(value){ return String(value ?? ''); },
  bsfSpreadsheetSafeText(value){ return String(value ?? ''); },
  URL:{
    createObjectURL(blob){ lastDownload = blob; return 'blob:test'; },
    revokeObjectURL(){},
  },
  Blob:class {
    constructor(parts, options){
      this.parts = parts;
      this.type = options && options.type;
    }
  },
  clientScoped:false,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename:'reports.js' });

test('report cards and CSV/Excel/PDF model share the API summary values', () => {
  vm.runInContext(`
    reportFilters = { client:'Client A', device:'', period:'monthly', month:10, year:2026 };
    reportFoodWasteData = [
      { date:'2026-10-01', value:12.5 },
      { date:'2026-10-02', value:7.5 }
    ];
    reportApiData = {
      summary:{ wasteKg:20, ghgKg:18.4, energyKwh:3, fertilizerKg:2.4, avgTempC:41.2, avgHumidityPct:53.5, pointCount:2 },
      items:reportFoodWasteData
    };
    reportApiKey = reportRequestKey();
  `, sandbox);
  const model = vm.runInContext('reportExportModel()', sandbox);
  assert.equal(model.title, 'Client Monthly Report');
  assert.deepEqual(JSON.parse(JSON.stringify(model.metrics)), {
    wasteKg:'20.0',
    ghgKg:'18.4',
    energyKwh:'3.0',
    fertilizerKg:'2.4',
    avgTempC:'41.2',
    avgHumidityPct:'53.5'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(model.foodWaste.map((row) => row.value))), [12.5, 7.5]);
  assert.equal(model.chartTitle, 'Daily Food Waste In (KG)');
});

test('report preview exposes PDF and Excel exports without a CSV button', () => {
  assert.match(source, /onclick="exportReportPdf\(\)"/);
  assert.match(source, /onclick="exportReportExcel\(\)"/);
  assert.doesNotMatch(source, /onclick="exportReportCsv\(\)"/);
  assert.doesNotMatch(source, /downloadDeviceExport/);
  assert.match(source, /bsf-report-.*\.xls/);
  assert.match(source, /reportRowsForPeriod\(\)/);
  assert.match(source, /reportExcelSheet\('Weight'/);
  assert.match(source, /reportExcelSheet\('Temp'/);
  assert.match(source, /reportExcelSheet\('Humidity'/);
});

test('report Excel export creates independent Weight, Temp and Humidity sheets', () => {
  sandbox.window.BSF_DEVICE_HISTORY_ROWS = [{
    recordedAt: '2026-10-01 10:00:00',
    device: 'device-a',
    weight: 12,
    temperature: 41,
    humidity: 53,
  }];
  sandbox.scopedDevices = function(){ return [{ id:'device-a', client:'Client A' }]; };
  sandbox.devices = [{ id:'device-a', client:'Client A' }];
  vm.runInContext(`
    reportFilters = { client:'Client A', device:'', period:'monthly', month:10, year:2026 };
    exportReportExcel();
  `, sandbox);

  assert.equal(lastDownload.type, 'application/vnd.ms-excel;charset=utf-8');
  const xml = String(lastDownload.parts[0]);
  assert.match(xml, /<Worksheet ss:Name="Weight">/);
  assert.match(xml, /<Worksheet ss:Name="Temp">/);
  assert.match(xml, /<Worksheet ss:Name="Humidity">/);
  assert.match(xml, /ss:Type="Number">12</);
  assert.match(xml, /ss:Type="Number">41</);
  assert.match(xml, /ss:Type="Number">53</);
  delete sandbox.window.BSF_DEVICE_HISTORY_ROWS;
  sandbox.scopedDevices = function(){ return []; };
  sandbox.devices = [];
});

test('report Excel export leaves missing measurements blank', () => {
  const xml = sandbox.reportExcelXml([{
    recordedAt: '2026-10-01 10:00:00',
    device: 'device-a',
    weight: '—',
    temperature: '',
    humidity: null,
  }]);
  assert.doesNotMatch(xml, /ss:Type="Number">0</);
  assert.match(xml, /<Cell\/>/);
});

test('PDF library is loaded only when PDF export is requested', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(index, /src="\/src\/vendor\/jspdf\.umd\.min\.js"/);
  assert.match(source, /function loadReportJsPdf\(\)/);
  assert.match(source, /const JsPDF = await loadReportJsPdf\(\)/);
});

test('missing report days stay missing while a real zero remains exportable', () => {
  vm.runInContext(`
    reportFilters = { client:'Client A', device:'', period:'monthly', month:10, year:2026 };
    reportFoodWasteData = [
      { date:'2026-10-01', value:null },
      { date:'2026-10-28', value:0 },
      { date:'2026-10-29', value:null },
      { date:'2026-10-30', value:undefined }
    ];
    reportApiData = {
      summary:{ wasteKg:99, ghgKg:147.9, energyKwh:1.5, fertilizerKg:11.9, avgTempC:41, avgHumidityPct:0.2, pointCount:1 },
      items:reportFoodWasteData
    };
    reportApiKey = reportRequestKey();
  `, sandbox);
  const rows = vm.runInContext('reportExportModel().foodWaste', sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { label:'2026-10-28', xLabel:'28', value:0 }
  ]);
});

test('reports show missing or partial vendor daily data without telemetry estimates', () => {
  vm.runInContext(`
    reportFilters = { client:'Client A', device:'', period:'monthly', month:10, year:2026 };
    reportApiData = {
      summary:{ pointCount:0, wasteKg:null, ghgKg:null, energyKwh:null },
      items:[],
      dataSources:{ dailyStats:{ status:'empty' } }
    };
    reportApiKey = reportRequestKey();
  `, sandbox);
  assert.equal(
    vm.runInContext('reportVendorDataStatus().text', sandbox),
    'No vendor daily report for the selected period.'
  );

  vm.runInContext("reportApiData.dataSources.dailyStats.status = 'partial';", sandbox);
  assert.equal(
    vm.runInContext('reportVendorDataStatus().text', sandbox),
    'Some vendor daily reports are unavailable for the selected period.'
  );
});

test('Generate Preview bypasses an empty cached report and requests fresh vendor data', async () => {
  let requestCount = 0;
  sandbox.currentPage = 'other';
  sandbox.window.BSF_API = {
    getReports: async function(){
      requestCount += 1;
      return {
        summary:{ wasteKg:0, ghgKg:null, energyKwh:1.5, pointCount:30 },
        items:[],
        dataSources:{ dailyStats:{ status:'vendor' } }
      };
    }
  };
  vm.runInContext(`
    reportFilters = { client:'', device:'365701012616B60D', period:'monthly', month:10, year:2026 };
    reportApiData = {
      summary:{ wasteKg:null, ghgKg:null, energyKwh:null, pointCount:0 },
      items:[],
      dataSources:{ dailyStats:{ status:'empty' } }
    };
    reportApiKey = reportRequestKey();
  `, sandbox);

  await vm.runInContext('loadReportFoodWaste({ force:true })', sandbox);

  assert.equal(requestCount, 1);
  assert.equal(vm.runInContext('reportApiData.summary.energyKwh', sandbox), 1.5);
  assert.equal(vm.runInContext('reportApiData.dataSources.dailyStats.status', sandbox), 'vendor');
  sandbox.currentPage = 'reports';
  delete sandbox.window.BSF_API;
});

test('client-scoped reports hide the energy metric while master admin keeps it', () => {
  assert.equal(vm.runInContext('reportShowsEnergy()', sandbox), true);
  sandbox.clientScoped = true;
  assert.equal(vm.runInContext('reportShowsEnergy()', sandbox), false);
  sandbox.clientScoped = false;
});

test('report machine option uses the backend id and displays the machine name', () => {
  assert.match(source, /const value = dev\.backendId \|\| dev\.id/);
  assert.match(source, /const selectedDevice = scopedDevices\(\)\.find/);
  assert.match(source, /const reportDevice = selectedDevice \? selectedDevice\.id/);
});

test('report preview hides the obsolete Alert Summary section', () => {
  assert.doesNotMatch(source, /Alert Summary/);
  assert.doesNotMatch(source, /alertSummaryMarkup/);
});
