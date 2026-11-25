import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as metrics from '../src/shared/metrics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/reports.js'), 'utf8');
const xlsxSource = fs.readFileSync(path.join(root, 'src/ui/report-xlsx.js'), 'utf8');
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
  TextEncoder,
  clientScoped:false,
};
sandbox.window.bsfSpreadsheetSafeText = sandbox.bsfSpreadsheetSafeText;
vm.createContext(sandbox);
vm.runInContext(xlsxSource, sandbox, { filename:'report-xlsx.js' });
vm.runInContext(source, sandbox, { filename:'reports.js' });

test('report cards and CSV/Excel/PDF model share the API summary values', () => {
  vm.runInContext(`
    reportFilters = { client:'Client A', device:'', period:'monthly', month:10, year:2026 };
    reportFoodWasteData = [
      { date:'2026-10-01', value:12.5 },
      { date:'2026-10-02', value:7.5 }
    ];
    reportApiData = {
      summary:{ wasteInAverageKg:0.8667, wasteInTotalKg:26, wasteKg:20, ghgKg:18.4, energyKwh:3, fertilizerKg:2.4, avgTempC:41.2, avgHumidityPct:53.5, pointCount:2 },
      items:reportFoodWasteData
    };
    reportApiKey = reportRequestKey();
  `, sandbox);
  const model = vm.runInContext('reportExportModel()', sandbox);
  assert.equal(model.title, 'Client Monthly Report');
  assert.deepEqual(JSON.parse(JSON.stringify(model.metrics)), {
    wasteInAverageKg:'0.9',
    wasteInTotalKg:'26.0',
    wasteKg:'20.0',
    ghgKg:'18.4',
    energyKwh:'3.0',
    fertilizerKg:'2.4',
    avgTempC:'41.2',
    avgHumidityPct:'53.5'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(model.foodWaste.map((row) => row.value))), [12.5, 7.5]);
  assert.equal(model.chartTitle, 'Daily Waste-in (KG)');
});

test('report preview exposes PDF and Excel exports without a CSV button', () => {
  assert.match(source, /onclick="exportReportPdf\(\)"/);
  assert.match(source, /onclick="exportReportExcel\(\)"/);
  assert.doesNotMatch(source, /onclick="exportReportCsv\(\)"/);
  assert.doesNotMatch(source, /downloadDeviceExport/);
  assert.match(source, /bsf-report-.*\.xlsx/);
  assert.match(source, /reportRowsForPeriod\(\)/);
  assert.match(source, /BSF_REPORT_XLSX\.build/);
  assert.match(source, /chartTitle:reportExcelChartTitle\(\)/);
  assert.match(source, /chartPeriod:reportFilters\.period/);
  assert.match(source, /periodStart:range\.start/);
});

test('report Excel export creates independent Weight, Temp and Humidity sheets', async () => {
  sandbox.window.BSF_DEVICE_HISTORY_ROWS = [{
    recordedAt: '2026-10-01 10:00:00',
    device: 'device-a',
    weight: 12,
    temperature: 41,
    humidity: 53,
  }];
  sandbox.scopedDevices = function(){ return [{ id:'device-a', client:'Client A' }]; };
  sandbox.devices = [{ id:'device-a', client:'Client A' }];
  await vm.runInContext(`
    reportFilters = { client:'Client A', device:'', period:'monthly', month:10, year:2026 };
    exportReportExcel();
  `, sandbox);

  assert.equal(lastDownload.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const files = sandbox.window.BSF_REPORT_XLSX.workbookFiles([{
    recordedAt:'2026-10-01 10:00:00',
    device:'device-a',
    weight:12,
    temperature:41,
    humidity:53,
  }], {
    chartTitle:'Sep',
    chartPeriod:'monthly',
    periodStart:'2026-10-01',
    periodEnd:'2026-10-31',
  });
  assert.match(files.get('xl/charts/chart1.xml'), /<c:lineChart>/);
  assert.match(files.get('xl/charts/chart2.xml'), /<c:lineChart>/);
  assert.match(files.get('xl/charts/chart3.xml'), /<c:lineChart>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<a:t>Sep<\/a:t>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<c:marker val="0"\/>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<c:plotVisOnly val="0"\/>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<c:symbol val="none"\/>/);
  assert.doesNotMatch(files.get('xl/charts/chart1.xml'), /<c:symbol val="circle"\/>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<c:legendPos val="b"\/>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<a:srgbClr val="D9D9D9"\/>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<c:tickLblSkip val="1"\/>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<a:defRPr sz="900"\/>/);
  assert.match(files.get('xl/charts/chart1.xml'), /<c:tx><c:strRef><c:f>'Weight'!\$G\$1<\/c:f><\/c:strRef><\/c:tx>/);
  assert.match(files.get('xl/worksheets/sheet1.xml'), /Weight\(kg\)/);
  assert.match(files.get('xl/worksheets/sheet2.xml'), /Temp\(°C\)/);
  assert.match(files.get('xl/worksheets/sheet3.xml'), /Hum\(%\)/);
  assert.match(files.get('xl/worksheets/sheet1.xml'), /<c r="F2" t="inlineStr"><is><t xml:space="preserve">1<\/t><\/is><\/c>/);
  assert.match(files.get('xl/worksheets/sheet1.xml'), /<c r="F32" t="inlineStr"><is><t xml:space="preserve">31<\/t><\/is><\/c>/);
  assert.match(files.get('xl/worksheets/sheet1.xml'), /<col min="4" max="7"[^>]*hidden="1"\/>/);
  const rowNumbers = Array.from(files.get('xl/worksheets/sheet1.xml').matchAll(/<row r="(\d+)"/g), (match) => Number(match[1]));
  assert.equal(new Set(rowNumbers).size, rowNumbers.length);
  const zipText = Buffer.from(new Uint8Array(lastDownload.parts[0])).toString('utf8');
  assert.match(zipText, /xl\/charts\/chart1\.xml/);
  assert.match(zipText, /<c:lineChart>/);
  delete sandbox.window.BSF_DEVICE_HISTORY_ROWS;
  sandbox.scopedDevices = function(){ return []; };
  sandbox.devices = [];
});

test('report Excel export leaves missing measurements blank', () => {
  const files = sandbox.window.BSF_REPORT_XLSX.workbookFiles([{
    recordedAt: '2026-10-01 10:00:00',
    device: 'device-a',
    weight: '—',
    temperature: '',
    humidity: null,
  }]);
  assert.match(files.get('xl/worksheets/sheet1.xml'), /<c r="C2"\/>/);
  assert.match(files.get('xl/worksheets/sheet2.xml'), /<c r="C2"\/>/);
  assert.match(files.get('xl/worksheets/sheet3.xml'), /<c r="C2"\/>/);
});

test('monthly report charts plot one aggregate per day and keep missing days blank', () => {
  const rows = Array.from({ length:65 }, function(_, index){
    return {
      recordedAt:'2026-09-' + String(Math.floor(index / 3) + 1).padStart(2, '0') + ' 0' + (index % 3) + ':00:00',
      device:'device-a',
      weight:index / 100,
      temperature:40,
      humidity:50,
    };
  });
  rows.push({
    recordedAt:'2026-09-01 09:00:00',
    device:'device-a',
    weight:9.99,
    temperature:100,
    humidity:70,
  });
  const files = sandbox.window.BSF_REPORT_XLSX.workbookFiles(rows, {
    chartTitle:'Sep',
    chartPeriod:'monthly',
    periodStart:'2026-09-01',
    periodEnd:'2026-09-30',
  });
  const chart = files.get('xl/charts/chart1.xml');
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(chart, /<c:tickLblSkip val="1"\/>/);
  assert.match(chart, /<c:tickMarkSkip val="1"\/>/);
  assert.match(chart, /<a:bodyPr rot="-2700000"\/>/);
  assert.match(chart, /<c:numFmt formatCode="0.00" sourceLinked="0"\/>/);
  assert.match(sheet, /<c r="G2"><v>2.505<\/v><\/c>/);
  assert.match(sheet, /<c r="F31" t="inlineStr"><is><t xml:space="preserve">30<\/t><\/is><\/c>/);
  assert.doesNotMatch(sheet, /<c r="F32"/);
  assert.match(files.get('xl/charts/chart2.xml'), /<c:val><c:numRef><c:f>'Temp'!\$G\$2:\$G\$31<\/c:f><\/c:numRef><\/c:val>/);
});

test('yearly report chart groups samples by calendar month', () => {
  const files = sandbox.window.BSF_REPORT_XLSX.workbookFiles([
    { recordedAt:'2026-01-15 10:00:00', device:'device-a', weight:5, temperature:20, humidity:30 },
    { recordedAt:'2026-01-16 10:00:00', device:'device-a', weight:9, temperature:40, humidity:50 },
    { recordedAt:'2026-12-31 10:00:00', device:'device-a', weight:7, temperature:30, humidity:40 },
  ], {
    chartTitle:'2026',
    chartPeriod:'yearly',
    periodStart:'2026-01-01',
    periodEnd:'2026-12-31',
  });
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<c r="F2" t="inlineStr"><is><t xml:space="preserve">Jan<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="G2"><v>7<\/v><\/c>/);
  assert.match(sheet, /<c r="F13" t="inlineStr"><is><t xml:space="preserve">Dec<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="G13"><v>7<\/v><\/c>/);
});

test('report Excel export loads every raw-data page instead of the cached rows', async () => {
  const allRows = Array.from({ length:65 }, function(_, index){
    const minute = String(index % 60).padStart(2, '0');
    return {
      recordedAt:'2026-10-01 10:' + minute + ':00',
      sourceTimestampSeconds:1790000000 + index,
      device:'device-a',
      weight:index,
      temperature:40 + index / 10,
      humidity:50,
    };
  });
  sandbox.window.BSF_LOAD_RAW_SAMPLES = async function(options){
    const start = (options.page - 1) * options.pageSize;
    return {
      rows:allRows.slice(start, start + options.pageSize),
      total:allRows.length,
    };
  };
  sandbox.scopedDevices = function(){ return [{ id:'device-a', client:'Client A' }]; };
  sandbox.devices = [{ id:'device-a', client:'Client A' }];

  const rows = await vm.runInContext(`
    reportFilters = { client:'Client A', device:'', period:'monthly', month:10, year:2026 };
    reportRowsForExcelExport();
  `, sandbox);

  assert.equal(rows.length, 65);
  assert.deepEqual(
    Array.from(rows, (row) => Number(row.weight)).sort((left, right) => left - right),
    Array.from({ length:65 }, (_, index) => index)
  );
  delete sandbox.window.BSF_LOAD_RAW_SAMPLES;
  sandbox.scopedDevices = function(){ return []; };
  sandbox.devices = [];
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

test('report charts render weight, temperature and humidity average lines', () => {
  vm.runInContext(`
    reportFilters = { client:'Client A', device:'', period:'monthly', month:10, year:2026 };
    reportApiData = {
      summary:{ pointCount:2 },
      items:[],
      weightItems:[
        { date:'2026-10-01', label:'1', value:4, averageKg:4 },
        { date:'2026-10-02', label:'2', value:5, averageKg:5 },
        { date:'2026-10-03', label:'3', value:null, averageKg:null },
        { date:'2026-10-04', label:'4', value:6, averageKg:6 }
      ],
      tempItems:[
        { date:'2026-10-01', label:'1', value:38 },
        { date:'2026-10-02', label:'2', value:null },
        { date:'2026-10-03', label:'3', value:42 }
      ],
      humidityItems:[
        { date:'2026-10-01', label:'1', value:52 },
        { date:'2026-10-02', label:'2', value:48 },
        { date:'2026-10-03', label:'3', value:null }
      ]
    };
    reportApiKey = reportRequestKey();
  `, sandbox);
  const rows = vm.runInContext('normalizedReportWeightRows(true)', sandbox);
  const svg = vm.runInContext('buildReportFoodWasteSvg(normalizedReportWeightRows(true))', sandbox);
  const tempSvg = vm.runInContext('buildReportTemperatureSvg(normalizedReportMetricRows(reportApiData.tempItems, true))', sandbox);
  const humiditySvg = vm.runInContext('buildReportHumiditySvg(normalizedReportMetricRows(reportApiData.humidityItems, true))', sandbox);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].value, 4);
  assert.doesNotMatch(svg, /report-weight-range/);
  assert.match(svg, /class="report-average-line"/);
  assert.match(svg, /class="report-average-point"/);
  assert.match(tempSvg, /Average temperature line chart/);
  assert.match(tempSvg, /#f97316/);
  assert.match(humiditySvg, /Average humidity line chart/);
  assert.match(humiditySvg, /#0ea5e9/);
  assert.match(source, /id="report-temperature-chart"/);
  assert.match(source, /id="report-humidity-chart"/);
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
