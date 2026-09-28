let reportFilters = { client:'', device:'', period:'monthly', month:new Date().getMonth()+1, year:new Date().getFullYear() };
let reportFoodWasteData = [];

function reportPeriodTitle(){
  return reportFilters.period === 'yearly' ? 'Yearly' : 'Monthly';
}

function reportPad(value){
  return String(value).padStart(2, '0');
}

function reportPeriodRange(){
  const year = Number(reportFilters.year) || new Date().getFullYear();
  if(reportFilters.period === 'yearly'){
    return { start:year + '-01-01', end:year + '-12-31' };
  }
  const month = Math.min(12, Math.max(1, Number(reportFilters.month) || 1));
  const lastDay = new Date(year, month, 0).getDate();
  const monthText = reportPad(month);
  return { start:year + '-' + monthText + '-01', end:year + '-' + monthText + '-' + reportPad(lastDay) };
}

function reportRowsForPeriod(){
  const range = reportPeriodRange();
  return rawDataRows.filter(function(row){
    const dateText = String(row.recordedAt || '').slice(0,10);
    if(!dateText || dateText < range.start || dateText > range.end) return false;
    if(reportFilters.client){
      const device = devices.find(function(item){ return item.id === row.device; });
      if(!device || device.client !== reportFilters.client) return false;
    }
    if(reportFilters.device && row.device !== reportFilters.device) return false;
    return true;
  });
}

function reportYearOptions(){
  const years = new Set(rawDataRows.map(function(row){ return String(row.recordedAt || '').slice(0,4); }).filter(Boolean));
  years.add(String(reportFilters.year || new Date().getFullYear()));
  return Array.from(years).sort().reverse().map(function(year){
    return '<option value="' + year + '"' + (String(reportFilters.year)===year?' selected':'') + '>' + year + '</option>';
  }).join('');
}

function reportMonthOptions(){
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return monthNames.map(function(label, index){
    const value = String(index + 1);
    return '<option value="' + value + '"' + (String(reportFilters.month)===value?' selected':'') + '>' + label + '</option>';
  }).join('');
}

function reportFilterOptions(){
  const clients = [...new Set(devices.map(function(dev){ return dev.client || 'Unassigned'; }))];
  const clientOptions = '<option value="">All Clients</option>' + clients.map(function(client){
    return '<option value="' + client + '"' + (reportFilters.client===client?' selected':'') + '>' + client + '</option>';
  }).join('');
  const availableDevices = reportFilters.client ? devices.filter(function(dev){ return dev.client===reportFilters.client; }) : devices;
  const deviceOptions = '<option value="">All Devices</option>' + availableDevices.map(function(dev){
    return '<option value="' + dev.id + '"' + (reportFilters.device===dev.id?' selected':'') + '>' + dev.id + '</option>';
  }).join('');
  return { clientOptions:clientOptions, deviceOptions:deviceOptions };
}

function buildReportFoodWasteSvg(rows){
  const values = rows.map(function(row){ return Number(row.value !== undefined ? row.value : row.waste !== undefined ? row.waste : row.weight); }).filter(Number.isFinite);
  if(!values.length) return '<div style="height:180px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:13px;">No Food Waste API data</div>';
  const width = 1000, height = 180, left = 44, right = 20, top = 16, bottom = 30;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maxValue = Math.max.apply(null, values.concat([1]));
  const step = plotWidth / rows.length;
  const barWidth = Math.max(8, Math.min(52, step * 0.58));
  const bars = rows.map(function(row, index){
    const value = Number(row.value !== undefined ? row.value : row.waste !== undefined ? row.waste : row.weight);
    const barHeight = Math.max(2, (value / maxValue) * plotHeight * 0.92);
    const x = left + step * index + (step - barWidth) / 2;
    const y = top + plotHeight - barHeight;
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="3" fill="#3b82f6"><title>' + (row.label || row.period || row.date || '') + ': ' + value.toFixed(1) + ' KG</title></rect>';
  }).join('');
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" style="width:100%;height:180px;display:block;"><line x1="' + left + '" y1="' + (top+plotHeight) + '" x2="' + (left+plotWidth) + '" y2="' + (top+plotHeight) + '" stroke="#334155" stroke-width="1"/>' + bars + '</svg>';
}

function renderReportFoodWasteChart(){
  const chart = document.getElementById('report-food-waste-chart');
  if(!chart) return;
  chart.innerHTML = buildReportFoodWasteSvg(reportFoodWasteData);
}

async function loadReportFoodWaste(){
  if(!window.BSF_API || !window.BSF_API_CONFIG || !window.BSF_API_CONFIG.enabled){ reportFoodWasteData = []; renderReportFoodWasteChart(); return; }
  try {
    const data = await window.BSF_API.getFoodWaste({period:reportFilters.period, year:reportFilters.year, month:reportFilters.period === 'monthly' ? reportFilters.month : undefined, clientId:reportFilters.client || undefined, deviceId:reportFilters.device || undefined});
    reportFoodWasteData = data && (data.items || data.list) ? (data.items || data.list) : (Array.isArray(data) ? data : []);
  } catch(error) { reportFoodWasteData = []; }
  renderReportFoodWasteChart();
}

function setReportFilter(key, value){
  reportFilters[key] = value;
  if(key === 'client') reportFilters.device = '';
  renderReports(document.getElementById('page-content'));
}

function renderReports(container){
  const range = reportPeriodRange();
  const rangeStart = new Date(range.start + 'T00:00:00');
  const rangeEnd = new Date(range.end + 'T00:00:00');
  const reportDays = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000) + 1);
  const periodRows = reportRowsForPeriod();
  const reportData = window.BSF_REPORT_DATA || {};
  const dailyFertilizerRaw = reportData.dailyFertilizer !== undefined ? reportData.dailyFertilizer : window.BSF_REPORT_DAILY_FERTILIZER;
  const dailyFertilizer = Number(dailyFertilizerRaw);
  const fertilizerValue = Number.isFinite(dailyFertilizer) ? (dailyFertilizer * reportDays).toFixed(1) : '—';
  const validTemps = periodRows.map(function(row){ return Number(row.temperature); }).filter(Number.isFinite);
  const validHumidity = periodRows.map(function(row){ return Number(row.humidity); }).filter(Number.isFinite);
  const avgTemp = validTemps.length ? (validTemps.reduce(function(a,b){ return a+b; },0) / validTemps.length).toFixed(1) : '—';
  const avgHumidity = validHumidity.length ? (validHumidity.reduce(function(a,b){ return a+b; },0) / validHumidity.length).toFixed(1) : '—';
  const reportClient = reportFilters.client || (devices[0] ? devices[0].client : 'Unassigned');
  const reportDevice = reportFilters.device || 'All Devices';
  const reportPeriod = range.start + ' - ' + range.end;
  const options = reportFilterOptions();
  const title = reportPeriodTitle() + ' Report';

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Report Generation</h2>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;align-items:center;">
      <select onchange="setReportFilter('client',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">${options.clientOptions}</select>
      <select onchange="setReportFilter('period',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option value="monthly"${reportFilters.period==='monthly'?' selected':''}>Monthly Report</option><option value="yearly"${reportFilters.period==='yearly'?' selected':''}>Yearly Report</option></select>
      ${reportFilters.period === 'monthly' ? '<select id="report-month-filter" onchange="setReportFilter(\'month\',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">' + reportMonthOptions() + '</select>' : ''}
      ${reportFilters.period === 'yearly' ? '<select id="report-year-filter" onchange="setReportFilter(\'year\',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">' + reportYearOptions() + '</select>' : ''}
      <select onchange="setReportFilter('device',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">${options.deviceOptions}</select>
      <button onclick="generateReportPreview()" style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Generate Preview</button>
    </div>
    <div id="report-preview" style="background:#1e293b;border-radius:12px;padding:32px;border:1px solid #334155;max-width:900px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #334155;">
        <h1 style="font-size:24px;font-weight:700;color:#f8fafc;margin:0;">${title}</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">${reportPeriod} · ${reportClient} · ${reportDevice}</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px;">
        ${card('Waste Collected', '—', 'kg', '#3b82f6')}
        ${card('GHG Reduced', '—', 'kg CO₂e', '#10b981')}
        ${card('Energy Consumed', '—', 'kWh', '#ef4444')}
        ${card('Est. Fertilizer', fertilizerValue, 'kg', '#f59e0b')}
        ${card('Avg Container Temp', avgTemp, '°C', '#f97316')}
        ${card('Avg Humidity', avgHumidity, '%', '#0ea5e9')}
      </div>
      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Monthly Food Waste In (KG)</h3>
        <div id="report-food-waste-chart" style="background:#0f172a;border-radius:8px;padding:12px;border:1px solid #334155;"></div>
      </div>
      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Alert Summary</h3>
        <div style="background:#0f172a;border-radius:8px;padding:16px;border:1px solid #334155;">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;"><span style="color:#e2e8f0;font-size:13px;">Critical</span><span style="color:#64748b;font-weight:600;">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;"><span style="color:#e2e8f0;font-size:13px;">Warning</span><span style="color:#64748b;font-weight:600;">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;"><span style="color:#e2e8f0;font-size:13px;">Info</span><span style="color:#64748b;font-weight:600;">—</span></div>
        </div>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:32px;padding-top:24px;border-top:1px solid #334155;">
        <button style="padding:12px 24px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="exportReportPdf()">Export PDF</button>
        <button style="padding:12px 24px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="exportReportExcel()">Export Excel</button>
        <button style="padding:12px 24px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-weight:600;font-size:14px;cursor:pointer;" onclick="exportReportCsv()">Export CSV</button>
      </div>
    </div>
  `;
  renderReportFoodWasteChart();
  loadReportFoodWaste();
}

function generateReportPreview(){
  const container = document.getElementById('page-content');
  renderReports(container);
  const preview = container.querySelector('#report-preview');
  if(preview) preview.scrollIntoView({ behavior:'smooth', block:'start' });
  showReportExportToast('Report preview updated');
}

function reportExportModel(){
  const range = reportPeriodRange();
  const rangeStart = new Date(range.start + 'T00:00:00');
  const rangeEnd = new Date(range.end + 'T00:00:00');
  const reportDays = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000) + 1);
  const reportData = window.BSF_REPORT_DATA || {};
  const dailyFertilizerRaw = reportData.dailyFertilizer !== undefined ? reportData.dailyFertilizer : window.BSF_REPORT_DAILY_FERTILIZER;
  const dailyFertilizer = Number(dailyFertilizerRaw);
  const fertilizerValue = Number.isFinite(dailyFertilizer) ? (dailyFertilizer * reportDays).toFixed(1) : '—';
  const reportClient = reportFilters.client || (devices[0] ? devices[0].client : 'Unassigned');
  const reportDevice = reportFilters.device || 'All Devices';
  const reportPeriod = range.start + ' - ' + range.end;
  const title = reportPeriodTitle() + ' Report';
  const foodWaste = reportFoodWasteData.map(function(row){
    return { label:row.label || row.period || row.date || '', value:Number(row.value !== undefined ? row.value : row.waste !== undefined ? row.waste : row.weight) };
  }).filter(function(row){ return row.label && Number.isFinite(row.value); });
  return { title:title, period:reportPeriod, client:reportClient, device:reportDevice, fertilizerValue:fertilizerValue, foodWaste:foodWaste };
}

let reportExportToastTimer = null;

function showReportExportToast(message, type){
  let toast = document.getElementById('report-export-toast');
  if(!toast){ toast = document.createElement('div'); toast.id = 'report-export-toast'; document.body.appendChild(toast); }
  const success = type !== 'error';
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;padding:12px 18px;border-radius:8px;color:' + (success ? '#e2e8f0' : '#fecaca') + ';background:' + (success ? '#065f46' : '#7f1d1d') + ';border:1px solid ' + (success ? '#10b981' : '#ef4444') + ';box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:13px;font-weight:600;opacity:1;transition:opacity .2s;';
  if(reportExportToastTimer) clearTimeout(reportExportToastTimer);
  reportExportToastTimer = setTimeout(function(){ toast.style.opacity = '0'; setTimeout(function(){ if(toast) toast.remove(); }, 250); }, 3200);
}
function downloadReportFile(filename, mime, content){
  const blob = new Blob([content], { type:mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value){ return '"' + String(value === undefined || value === null ? '' : value).replace(/"/g, '""') + '"'; }

function exportReportCsv(){
  const model = reportExportModel();
  const rows = [['Report',model.title],['Period',model.period],['Client',model.client],['Machine',model.device],[],['Metric','Value','Unit'],['Waste Collected','—','kg'],['GHG Reduced','—','kg CO₂e'],['Energy Consumed','—','kWh'],['Est. Fertilizer',model.fertilizerValue,'kg'],['Avg Container Temp','—','°C'],['Avg Humidity','—','%'],[],['Monthly Food Waste In (KG)']];
  model.foodWaste.forEach(function(row){ rows.push([row.label,row.value]); });
  downloadReportFile('bsf-report-' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv;charset=utf-8', '\uFEFF' + rows.map(function(row){ return row.map(csvCell).join(','); }).join('\r\n'));
  showReportExportToast('CSV 导出已开始');
}

function exportReportExcel(){
  const model = reportExportModel();
  const rows = [['Metric','Value','Unit'],['Waste Collected','—','kg'],['GHG Reduced','—','kg CO₂e'],['Energy Consumed','—','kWh'],['Est. Fertilizer',model.fertilizerValue,'kg'],['Avg Container Temp','—','°C'],['Avg Humidity','—','%']];
  const tableRows = rows.map(function(row){ return '<tr>' + row.map(function(cell){ return '<td>' + String(cell) + '</td>'; }).join('') + '</tr>'; }).join('');
  const foodRows = model.foodWaste.map(function(row){ return '<tr><td>' + row.label + '</td><td>' + row.value + '</td><td>KG</td></tr>'; }).join('');
  const html = '<html><head><meta charset="UTF-8"></head><body><h2>' + model.title + '</h2><p>' + model.period + ' · ' + model.client + ' · ' + model.device + '</p><table border="1">' + tableRows + '</table><h3>Monthly Food Waste In (KG)</h3><table border="1"><tr><td>Period</td><td>Value</td><td>Unit</td></tr>' + foodRows + '</table></body></html>';
  downloadReportFile('bsf-report-' + new Date().toISOString().slice(0,10) + '.xls', 'application/vnd.ms-excel;charset=utf-8', '\uFEFF' + html);
  showReportExportToast('Excel 导出已开始');
}

function exportReportPdf(){
  const model = reportExportModel();
  const rows = [['Metric','Value','Unit'],['Waste Collected','—','kg'],['GHG Reduced','—','kg CO₂e'],['Energy Consumed','—','kWh'],['Est. Fertilizer',model.fertilizerValue,'kg'],['Avg Container Temp','—','°C'],['Avg Humidity','—','%']];
  const tableRows = rows.map(function(row){ return '<tr>' + row.map(function(cell){ return '<td>' + cell + '</td>'; }).join('') + '</tr>'; }).join('');
  const foodRows = model.foodWaste.map(function(row){ return '<tr><td>' + row.label + '</td><td>' + row.value + '</td><td>KG</td></tr>'; }).join('');
  const printWindow = window.open('', '_blank');
  if(!printWindow){ showReportExportToast('浏览器阻止了打印窗口，请允许弹窗', 'error'); return; }
  printWindow.document.write('<html><head><title>' + model.title + '</title></head><body><h1>' + model.title + '</h1><p>' + model.period + ' · ' + model.client + ' · ' + model.device + '</p><h3>Report Summary</h3><table border="1" cellspacing="0" cellpadding="6">' + tableRows + '</table><h3>Monthly Food Waste In (KG)</h3><table border="1" cellspacing="0" cellpadding="6"><tr><th>Period</th><th>Value</th><th>Unit</th></tr>' + foodRows + '</table></body></html>');
  printWindow.document.close();
  printWindow.focus();
  showReportExportToast('已打开打印窗口，请选择“另存为 PDF”');
  setTimeout(function(){ printWindow.print(); }, 300);
}
