
let rawDataFilterMessage = '';

let rawDataHistoryRows = [];
let rawDataHistoryTotal = 0;
let rawDataHistoryLoading = false;
let rawDataHistoryError = '';
let rawDataHistoryRequestKey = '';
let rawDataHistoryCompletedKey = '';
function rawDataPad(value){ return String(value).padStart(2, '0'); }
function rawDataInputValue(date){
  return date.getFullYear() + '-' + rawDataPad(date.getMonth() + 1) + '-' + rawDataPad(date.getDate()) + 'T' + rawDataPad(date.getHours()) + ':' + rawDataPad(date.getMinutes());
}
function rawDataDay(value){ return String(value || '').slice(0, 10); }
function rawDataDateTime(value){
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : '';
}
function rawDataAddDays(value, days){
  const date = new Date(String(value || '').slice(0, 10) + 'T00:00:00');
  if(!Number.isFinite(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return rawDataDay(rawDataInputValue(date));
}
function rawDataEnsureDateFilters(){
  const now = new Date();
  if(!rawDataFilters.end) rawDataFilters.end = rawDataInputValue(now);
  if(!rawDataFilters.start) rawDataFilters.start = rawDataAddDays(rawDataFilters.end, -59) + 'T00:00';
  if(rawDataFilters.start && rawDataFilters.end && rawDataFilters.start > rawDataFilters.end){
    rawDataFilters.start = rawDataDay(rawDataFilters.end) + 'T00:00';
  }
}
function rawDataHistoryRange(){
  rawDataEnsureDateFilters();
  let start = rawDataDateTime(rawDataFilters.start);
  let end = rawDataDateTime(rawDataFilters.end);
  if(!end) end = rawDataInputValue(new Date());
  if(!start) start = rawDataAddDays(end, -59) + 'T00:00';
  if(start > end) start = end;
  const minStart = rawDataAddDays(end, -59) + 'T00:00';
  if(start < minStart) start = minStart;
  return { start:start, end:end };
}
function rawDataHistoryViewKey(){
  const range = rawDataHistoryRange();
  return [range.start, range.end, rawDataFilters.client || '', rawDataFilters.device || '', rawDataPage].join('|');
}
function rawDataRequestOptions(page, pageSize){
  const selectedDevice = scopedDevices().find(function(device){ return device.id === rawDataFilters.device; });
  const range = rawDataHistoryRange();
  return {
    page:page || 1,
    pageSize:pageSize || RAW_DATA_PAGE_SIZE,
    start:range.start,
    end:range.end,
    clientId:rawDataFilters.client || undefined,
    machineId:selectedDevice ? selectedDevice.id : undefined,
    devices:scopedDevices()
  };
}
function rawDataHistoryStatusMarkup(){
  let message = '';
  let color = '#64748b';
  if(rawDataHistoryLoading){
    message = 'Loading saved samples...';
  } else if(rawDataHistoryError){
    message = rawDataHistoryError;
    color = '#f59e0b';
  } else if(rawDataHistoryCompletedKey){
    message = rawDataHistoryTotal ? rawDataHistoryTotal + ' saved sample' + (rawDataHistoryTotal === 1 ? '' : 's') + ' in the selected period' : 'No saved samples in the selected period';
  }
  return '<p id="raw-history-status" style="min-height:18px;margin:-6px 0 12px;color:' + color + ';font-size:12px;">' + bsfEscapeHtml(message) + (rawDataHistoryError ? ' <button onclick="retryRawDataHistory()" style="margin-left:8px;padding:2px 8px;background:#334155;border:1px solid #475569;border-radius:5px;color:#e2e8f0;cursor:pointer;font-size:11px;">Retry</button>' : '') + '</p>';
}
function retryRawDataHistory(){
  rawDataHistoryCompletedKey = '';
  rawDataHistoryError = '';
  rawDataLoadHistory();
}
async function rawDataLoadHistory(){
  const key = rawDataHistoryViewKey();
  if(!window.BSF_LOAD_RAW_SAMPLES){
    rawDataHistoryCompletedKey = key;
    rawDataHistoryError = 'Saved sample API is unavailable';
    return;
  }
  if(rawDataHistoryLoading && key === rawDataHistoryRequestKey) return;
  if(rawDataHistoryCompletedKey === key) return;

  rawDataHistoryLoading = true;
  rawDataHistoryRequestKey = key;
  rawDataHistoryError = '';
  const status = document.getElementById('raw-history-status');
  if(status) status.textContent = 'Loading saved samples...';

  try {
    const result = await window.BSF_LOAD_RAW_SAMPLES(rawDataRequestOptions(rawDataPage, RAW_DATA_PAGE_SIZE));
    rawDataHistoryRows = Array.isArray(result.rows) ? result.rows : [];
    rawDataHistoryTotal = Number(result.total) || 0;
    rawDataPage = Math.min(Math.max(Number(result.page) || rawDataPage, 1), Math.max(1, Math.ceil(rawDataHistoryTotal / RAW_DATA_PAGE_SIZE)));
    rawDataHistoryCompletedKey = rawDataHistoryViewKey();
  } catch(error) {
    rawDataHistoryRows = [];
    rawDataHistoryTotal = 0;
    rawDataHistoryError = error && error.message ? error.message : 'Saved samples could not be loaded';
    rawDataHistoryCompletedKey = key;
  } finally {
    rawDataHistoryLoading = false;
  }

  if(currentPage === 'raw-data'){
    renderRawData(document.getElementById('page-content'));
  }
}
function rawDataPaginationHtml(totalPages){
  const current = Math.min(Math.max(rawDataPage,1), Math.max(totalPages,1));
  let html = '<button '+(current<=1?'disabled':'')+' onclick="setRawDataPage('+(current-1)+')" style="padding:6px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:'+(current<=1?'#475569':'#94a3b8')+';font-size:12px;cursor:'+(current<=1?'not-allowed':'pointer')+';">Prev</button>';
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, start + 4);
  for(let page=start; page<=end; page++){
    const active = page === current;
    html += '<button onclick="setRawDataPage('+page+')" style="padding:6px 12px;background:'+(active?'#10b981':'#0f172a')+';border:'+(active?'none':'1px solid #334155')+';border-radius:6px;color:'+(active?'#fff':'#94a3b8')+';font-size:12px;cursor:pointer;font-weight:'+(active?'600':'400')+';">'+page+'</button>';
  }
  html += '<button '+(current>=totalPages?'disabled':'')+' onclick="setRawDataPage('+(current+1)+')" style="padding:6px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:'+(current>=totalPages?'#475569':'#94a3b8')+';font-size:12px;cursor:'+(current>=totalPages?'not-allowed':'pointer')+';">Next</button>';
  return html;
}
function setRawDataPage(page){ rawDataPage=page; rawDataLoadHistory(); }

function rawDataTime(row){ const value=String(row.recordedAt || '').replace(' ','T'); const time=new Date(value).getTime(); return Number.isFinite(time)?time:null; }
function rawDataUpdateDateLimits(){
  const startInput=document.getElementById('raw-start-filter');
  const endInput=document.getElementById('raw-end-filter');
  if(startInput) startInput.max=rawDataFilters.end || '';
  if(endInput) endInput.min=rawDataFilters.start || '';
}
function rawDataSetStartDate(value){
  rawDataFilterMessage='';
  rawDataFilters.start=value || '';
  if(rawDataFilters.start && rawDataFilters.end && rawDataFilters.start > rawDataFilters.end){
    rawDataFilters.start=rawDataFilters.end;
    rawDataFilterMessage='Start date cannot be after end date. It has been adjusted to the end date.';
  }
  const input=document.getElementById('raw-start-filter');
  if(input) input.value=rawDataFilters.start;
  rawDataUpdateDateLimits();
}
function rawDataSetEndDate(value){
  rawDataFilterMessage='';
  rawDataFilters.end=value || '';
  if(rawDataFilters.start && rawDataFilters.end && rawDataFilters.end < rawDataFilters.start){
    rawDataFilters.end=rawDataFilters.start;
    rawDataFilterMessage='End date cannot be before start date. It has been adjusted to the start date.';
  }
  const input=document.getElementById('raw-end-filter');
  if(input) input.value=rawDataFilters.end;
  rawDataUpdateDateLimits();
}
function rawDataFilteredRows(){ return rawDataHistoryRows.slice(); }
function applyRawDataFilter(){
  let start=(document.getElementById('raw-start-filter')||{}).value||'';
  let end=(document.getElementById('raw-end-filter')||{}).value||'';
  rawDataFilterMessage='';
  if(start && end && start > end){
    end=start;
    rawDataFilterMessage='Start date cannot be after end date. End date has been adjusted.';
  }
  rawDataFilters.start=start;
  rawDataFilters.end=end;
  rawDataPage=1;
  rawDataHistoryCompletedKey='';
  rawDataLoadHistory();
}
function rawCsvCell(value){ return '"' + bsfSpreadsheetSafeText(value).replace(/"/g,'""') + '"'; }
function rawDataDisplay(value){ return bsfEscapeHtml(value === undefined || value === null || value === '' ? '—' : value); }
function rawDeviceStateStyle(state){
  const normalized = String(state || 'offline').toLowerCase();
  if(normalized === 'running') return { background:'rgba(59,130,246,0.15)', color:'#3b82f6' };
  if(normalized === 'standby') return { background:'rgba(245,158,11,0.15)', color:'#f59e0b' };
  return { background:'rgba(239,68,68,0.15)', color:'#ef4444' };
}
function rawDeviceStateMarkup(state){
  const style = rawDeviceStateStyle(state);
  return '<span style="padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;background:' + style.background + ';color:' + style.color + ';">' + rawDataDisplay(state) + '</span>';
}
function rawDataToast(message){ let toast=document.getElementById('raw-data-toast'); if(!toast){toast=document.createElement('div');toast.id='raw-data-toast';document.body.appendChild(toast);} toast.textContent=message; toast.style.cssText='position:fixed;top:20px;right:20px;z-index:100000;padding:12px 18px;border-radius:8px;color:#e2e8f0;background:#065f46;border:1px solid #10b981;box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:13px;font-weight:600;'; setTimeout(function(){if(toast)toast.remove();},3000); }
async function rawDataLoadAllForExport(){
  const rows = [];
  let page = 1;
  let total = 0;
  while(page <= 1000){
    const result = await window.BSF_LOAD_RAW_SAMPLES(rawDataRequestOptions(page, RAW_DATA_PAGE_SIZE));
    const batch = Array.isArray(result.rows) ? result.rows : [];
    rows.push.apply(rows, batch);
    total = Number(result.total) || 0;
    if(!batch.length || rows.length >= total) break;
    page += 1;
  }
  if(rows.length < total) throw new Error('The export contains too many records; narrow the date range.');
  return rows;
}
async function exportRawDataCsv(){
  let rows = rawDataFilteredRows();
  if(window.BSF_LOAD_RAW_SAMPLES){
    try {
      rows = await rawDataLoadAllForExport();
    } catch(error) {
      rawDataToast(error && error.message ? error.message : 'Raw Data export failed');
      return;
    }
  }
  const compact = isClientScopedRole();
  const head = compact
    ? ['Recorded At','Device','State','Weight(kg)','Temp(°C)','Hum(%)']
    : ['Recorded At','Device','State','Operating','Ferment','Run Time(min)','Weight(kg)','Total Add(kg)','Single Add(kg)','Total Discharge(kg)','Single Discharge(kg)','Discharge','Feed','Shredder','Mixing Motor','Fan','Zipper','Temp(°C)','Hot Plate Temp(°C)','Hum(%)','Energy(kWh)','Solar Power(kW)','CO2(ppm)','NO2(ppm)','H2S(ppm)','Signal'];
  const body = rows.map(function(row){
    const state = row.operatingStatus && row.operatingStatus !== '—' ? row.operatingStatus : row.deviceState;
    return compact
      ? [row.recordedAt,row.device,state,row.weight,row.temperature,row.humidity]
      : [row.recordedAt,row.device,row.deviceState,row.operatingStatus,row.fermentState,row.runTime,row.weight,row.totalAddMaterial,row.singleAddMaterial,row.totalDischarge,row.singleDischarge,row.discharge,row.feed,row.shredder,row.mixingMotor,row.fan,row.zipper,row.temperature,row.hotPlateTemp,row.humidity,row.energy,row.solarPower,row.co2,row.no2,row.h2s,row.signal];
  });
  const csv = [head].concat(body).map(function(row){ return row.map(rawCsvCell).join(','); }).join('\r\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bsf-raw-data-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  rawDataToast('Raw Data CSV export started');
}



function rawDataCompactTableMarkup(rows){
  const th = 'padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;';
  const td = 'padding:10px 16px;color:#e2e8f0;white-space:nowrap;';
  return `<table class="raw-data-table" style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#0f172a;border-bottom:1px solid #334155;">
      <th style="${th}">Recorded At</th><th style="${th}">Device</th><th style="${th}">State</th>
      <th style="${th}">Weight(kg)</th><th style="${th}">Temp(°C)</th><th style="${th}">Hum(%)</th>
    </tr></thead>
    <tbody>${rows.map((row,i)=>`<tr style="border-bottom:1px solid #334155;background:${i%2===0?'#1e293b':'#1a2332'};">
      <td style="${td}">${rawDataDisplay(row.recordedAt)}</td>
      <td style="${td}font-weight:600;">${rawDataDisplay(row.device)}</td>
      <td style="padding:10px 16px;">${rawDeviceStateMarkup(row.deviceState)}</td>
      <td style="${td}">${rawDataDisplay(row.weight)}</td>
      <td style="${td}">${rawDataDisplay(row.temperature)}</td>
      <td style="${td}">${rawDataDisplay(row.humidity)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}
function rawDataFullTableMarkup(rows){
  const th = 'padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;';
  const td = 'padding:10px 16px;color:#e2e8f0;white-space:nowrap;';
  return `<table class="raw-data-table" style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#0f172a;border-bottom:1px solid #334155;">
      <th style="${th}">Recorded At</th><th style="${th}">Device</th><th style="${th}">State</th>
      <th style="${th}">Operating</th><th style="${th}">Ferment</th><th style="${th}">Run Time(min)</th>
      <th style="${th}">Weight(kg)</th><th style="${th}">Total Add(kg)</th><th style="${th}">Single Add(kg)</th>
      <th style="${th}">Total Discharge(kg)</th><th style="${th}">Single Discharge(kg)</th><th style="${th}">Discharge</th>
      <th style="${th}">Feed</th><th style="${th}">Shredder</th><th style="${th}">Mixing Motor</th><th style="${th}">Fan</th><th style="${th}">Zipper</th>
      <th style="${th}">Temp(°C)</th><th style="${th}">Hot Plate Temp(°C)</th><th style="${th}">Hum(%)</th>
      <th style="${th}">Energy(kWh)</th><th style="${th}">Solar Power(kW)</th><th style="${th}">CO₂(ppm)</th><th style="${th}">NO₂(ppm)</th><th style="${th}">H₂S(ppm)</th><th style="${th}">Signal</th>
    </tr></thead>
    <tbody>${rows.map((row,i)=>`<tr style="border-bottom:1px solid #334155;background:${i%2===0?'#1e293b':'#1a2332'};">
      <td style="${td}">${rawDataDisplay(row.recordedAt)}</td><td style="${td}font-weight:600;">${rawDataDisplay(row.device)}</td>
      <td style="padding:10px 16px;">${rawDeviceStateMarkup(row.deviceState)}</td>
      <td style="${td}">${rawDataDisplay(row.operatingStatus)}</td><td style="${td}">${rawDataDisplay(row.fermentState)}</td><td style="${td}">${rawDataDisplay(row.runTime)}</td>
      <td style="${td}">${rawDataDisplay(row.weight)}</td><td style="${td}">${rawDataDisplay(row.totalAddMaterial)}</td><td style="${td}">${rawDataDisplay(row.singleAddMaterial)}</td>
      <td style="${td}">${rawDataDisplay(row.totalDischarge)}</td><td style="${td}">${rawDataDisplay(row.singleDischarge)}</td><td style="${td}">${rawDataDisplay(row.discharge)}</td>
      <td style="${td}">${rawDataDisplay(row.feed)}</td><td style="${td}">${rawDataDisplay(row.shredder)}</td><td style="${td}">${rawDataDisplay(row.mixingMotor)}</td><td style="${td}">${rawDataDisplay(row.fan)}</td><td style="${td}">${rawDataDisplay(row.zipper)}</td>
      <td style="${td}">${rawDataDisplay(row.temperature)}</td><td style="${td}">${rawDataDisplay(row.hotPlateTemp)}</td><td style="${td}">${rawDataDisplay(row.humidity)}</td>
      <td style="${td}">${rawDataDisplay(row.energy)}</td><td style="${td}">${rawDataDisplay(row.solarPower)}</td>
      <td style="padding:10px 16px;color:${parseFloat(row.co2)>900?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.co2)>900?'700':'400'};">${rawDataDisplay(row.co2)}</td>
      <td style="padding:10px 16px;color:${parseFloat(row.no2)>0.18?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.no2)>0.18?'700':'400'};">${rawDataDisplay(row.no2)}</td>
      <td style="padding:10px 16px;color:${parseFloat(row.h2s)>0.25?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.h2s)>0.25?'700':'400'};">${rawDataDisplay(row.h2s)}</td>
      <td style="${td}">${row.signal === undefined || row.signal === null || row.signal === '' ? '—' : rawDataDisplay(row.signal) + '%'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function populateRawDataFilters(clients, clientDevices){
  const clientSelect = document.getElementById('raw-client-filter');
  const deviceSelect = document.getElementById('raw-device-filter');
  if(clientSelect){
    const scoped = isClientScopedRole();
    const options = scoped ? [] : [{ value:'', label:'All Clients', selected:rawDataFilters.client === '' }];
    clients.forEach(function(client){
      options.push({ value:client, label:client, selected:rawDataFilters.client === client });
    });
    bsfReplaceSelectOptions(clientSelect, options);
    clientSelect.disabled = scoped;
    clientSelect.style.background = scoped ? '#111827' : '#1e293b';
    clientSelect.style.color = scoped ? '#94a3b8' : '#e2e8f0';
    clientSelect.style.cursor = scoped ? 'not-allowed' : 'pointer';
  }
  if(deviceSelect){
    const userRole = isUserRole();
    const options = userRole ? [] : [{ value:'', label:'All Machines', selected:rawDataFilters.device === '' }];
    clientDevices.forEach(function(dev){
      options.push({ value:dev.id, label:dev.id, selected:rawDataFilters.device === dev.id });
    });
    bsfReplaceSelectOptions(deviceSelect, options);
    deviceSelect.disabled = userRole;
    deviceSelect.style.background = userRole ? '#111827' : '#1e293b';
    deviceSelect.style.color = userRole ? '#94a3b8' : '#e2e8f0';
    deviceSelect.style.cursor = userRole ? 'not-allowed' : 'pointer';
  }
}
function renderRawData(container){
  rawDataEnsureDateFilters();
  const clients = scopedClientNames();
  const clientScoped = isClientScopedRole();
  const clientDevices = scopedDevices();
  const totalRows = rawDataHistoryTotal;
  const totalPages = Math.max(1, Math.ceil(totalRows / RAW_DATA_PAGE_SIZE));
  if(rawDataPage > totalPages) rawDataPage = totalPages;
  if(rawDataPage < 1) rawDataPage = 1;
  const startIndex = (rawDataPage - 1) * RAW_DATA_PAGE_SIZE;
  const pageRows = rawDataHistoryRows;
  const displayRows = pageRows.map(function(row){ return Object.assign({}, row); });
  const rowSummary = totalRows ? 'Showing ' + (startIndex + 1) + '-' + Math.min(startIndex + pageRows.length, totalRows) + ' of ' + totalRows + ' saved samples' : (rawDataHistoryLoading ? 'Loading saved samples...' : 'No records');
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Raw Data</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Telemetry and sensor raw records from all connected devices</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
      ${clientScoped ? clientScopeBadge() : '<label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Client Filter<select id="raw-client-filter" onchange="rawDataFilters.client=this.value;rawDataFilters.device=\'\';rawDataPage=1;renderRawData(document.getElementById(\'page-content\'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:240px;"></select></label>'}
    </div>
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        ${isUserRole() ? 'Machine' : 'Machine Filter'}
        <select id="raw-device-filter" onchange="rawDataFilters.device=this.value;rawDataPage=1;renderRawData(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:220px;"></select>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        Start Date
        <input id="raw-start-filter" type="datetime-local" value="${rawDataFilters.start || ''}" max="${rawDataFilters.end || ''}" onchange="rawDataSetStartDate(this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      </label>
      <span style="color:#64748b;display:flex;align-items:center;padding-bottom:11px;">to</span>
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        End Date
        <input id="raw-end-filter" type="datetime-local" value="${rawDataFilters.end || ''}" min="${rawDataFilters.start || ''}" onchange="rawDataSetEndDate(this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      </label>
      <button style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="applyRawDataFilter()">Filter</button>
      <button style="padding:10px 20px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-weight:600;font-size:14px;cursor:pointer;" onclick="exportRawDataCsv()">Export CSV</button>
    </div>
    <p id="raw-date-validation" style="min-height:18px;margin:0 0 12px;color:${rawDataFilterMessage ? '#f59e0b' : 'transparent'};font-size:12px;">${rawDataFilterMessage || '.'}</p>
    ${rawDataHistoryStatusMarkup()}
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
      <div style="overflow-x:auto;">
        ${isClientScopedRole() ? rawDataCompactTableMarkup(displayRows) : rawDataFullTableMarkup(displayRows)}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid #334155;">
        <span style="font-size:12px;color:#64748b;">${rowSummary}</span>
        <div style="display:flex;gap:6px;">${rawDataPaginationHtml(totalPages)}</div>
      </div>
    </div>
  `;
  populateRawDataFilters(clients, clientDevices);
  setTimeout(rawDataLoadHistory, 0);
}
