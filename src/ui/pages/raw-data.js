
let rawDataFilterMessage = '';

let rawDataHistoryRows = [];
let rawDataHistoryLoading = false;
let rawDataHistoryError = '';
let rawDataHistoryRequestKey = '';
let rawDataHistoryCompletedKey = '';
const rawDataHistoryCache = new Map();
const RAW_DATA_HISTORY_TTL_MS = 5 * 60 * 1000;

function rawDataPad(value){ return String(value).padStart(2, '0'); }
function rawDataInputValue(date){
  return date.getFullYear() + '-' + rawDataPad(date.getMonth() + 1) + '-' + rawDataPad(date.getDate()) + 'T' + rawDataPad(date.getHours()) + ':' + rawDataPad(date.getMinutes());
}
function rawDataDay(value){ return String(value || '').slice(0, 10); }
function rawDataAddDays(value, days){
  const date = new Date(String(value || '').slice(0, 10) + 'T00:00:00');
  if(!Number.isFinite(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return rawDataDay(rawDataInputValue(date));
}
function rawDataEnsureDateFilters(){
  const now = new Date();
  if(!rawDataFilters.end) rawDataFilters.end = rawDataInputValue(now);
  if(!rawDataFilters.start) rawDataFilters.start = rawDataAddDays(rawDataFilters.end, -29) + 'T00:00';
  if(rawDataFilters.start && rawDataFilters.end && rawDataFilters.start > rawDataFilters.end){
    rawDataFilters.start = rawDataDay(rawDataFilters.end) + 'T00:00';
  }
}
function rawDataHistoryRange(){
  rawDataEnsureDateFilters();
  let start = rawDataDay(rawDataFilters.start);
  let end = rawDataDay(rawDataFilters.end);
  if(!end) end = rawDataDay(rawDataInputValue(new Date()));
  if(!start) start = rawDataAddDays(end, -29);
  if(start > end) start = end;
  const minStart = rawDataAddDays(end, -29);
  if(start < minStart) start = minStart;
  return { start:start, end:end };
}
function rawDataHistoryTargets(){
  return scopedDevices().filter(function(device){
    if(rawDataFilters.client && device.client !== rawDataFilters.client) return false;
    if(rawDataFilters.device && device.id !== rawDataFilters.device) return false;
    return Boolean(device.vendorDeviceId);
  });
}
function rawDataHistoryCacheKey(device, range){
  return String(device.vendorDeviceId || device.id) + '|' + range.start + '|' + range.end + '|raw';
}
function rawDataHistoryViewKey(){
  const range = rawDataHistoryRange();
  return rawDataHistoryTargets().map(function(device){ return rawDataHistoryCacheKey(device, range); }).sort().join(',');
}
function rawDataHistoryStatusMarkup(){
  let message = '';
  let color = '#64748b';
  if(rawDataHistoryLoading){
    message = 'Loading vendor history...';
  } else if(rawDataHistoryError){
    message = rawDataHistoryError;
    color = '#f59e0b';
  } else if(rawDataHistoryCompletedKey){
    message = rawDataHistoryRows.length + ' historical vendor record' + (rawDataHistoryRows.length === 1 ? '' : 's') + ' loaded';
  }
  return '<p id="raw-history-status" style="min-height:18px;margin:-6px 0 12px;color:' + color + ';font-size:12px;">' + bsfEscapeHtml(message) + (rawDataHistoryError ? ' <button onclick="retryRawDataHistory()" style="margin-left:8px;padding:2px 8px;background:#334155;border:1px solid #475569;border-radius:5px;color:#e2e8f0;cursor:pointer;font-size:11px;">Retry</button>' : '') + '</p>';
}
function retryRawDataHistory(){
  rawDataHistoryCompletedKey = '';
  rawDataHistoryError = '';
  rawDataLoadHistory();
}
async function rawDataLoadHistory(){
  const targets = rawDataHistoryTargets();
  const range = rawDataHistoryRange();
  const key = rawDataHistoryViewKey();
  if(!targets.length || !window.BSF_LOAD_VENDOR_HISTORY){
    rawDataHistoryCompletedKey = key;
    rawDataHistoryError = '';
    return;
  }
  if(key === rawDataHistoryCompletedKey) return;
  if(rawDataHistoryLoading && key === rawDataHistoryRequestKey) return;

  rawDataHistoryLoading = true;
  rawDataHistoryRequestKey = key;
  rawDataHistoryError = '';
  const status = document.getElementById('raw-history-status');
  if(status) status.textContent = 'Loading vendor history...';

  const collected = [];
  const failures = [];
  const pending = [];
  targets.forEach(function(device){
    const cacheKey = rawDataHistoryCacheKey(device, range);
    const cached = rawDataHistoryCache.get(cacheKey);
    if(cached && Date.now() - cached.savedAt < RAW_DATA_HISTORY_TTL_MS){
      collected.push.apply(collected, cached.rows);
    } else {
      pending.push({ device:device, cacheKey:cacheKey });
    }
  });

  let cursor = 0;
  async function worker(){
    while(cursor < pending.length){
      const item = pending[cursor++];
      try {
        const rows = await window.BSF_LOAD_VENDOR_HISTORY({ device:item.device, start:range.start, end:range.end, groupBy:'raw' });
        rawDataHistoryCache.set(item.cacheKey, { savedAt:Date.now(), rows:rows });
        collected.push.apply(collected, rows);
      } catch(error) {
        const stale = rawDataHistoryCache.get(item.cacheKey);
        if(stale) collected.push.apply(collected, stale.rows);
        failures.push(item.device.id);
      }
    }
  }
  try {
    await Promise.all(Array.from({ length:Math.min(3, pending.length) }, worker));
    rawDataHistoryRows = window.BSF_MERGE_ROWS(collected, []);
    rawDataHistoryCompletedKey = key;
    rawDataHistoryError = failures.length ? 'Historical data is unavailable for ' + failures.length + ' machine' + (failures.length === 1 ? '' : 's') + '; live records remain visible.' : '';
  } finally {
    rawDataHistoryLoading = false;
  }

  if(currentPage === 'raw-data' && rawDataHistoryViewKey() === key){
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
function setRawDataPage(page){ rawDataPage=page; renderRawData(document.getElementById('page-content')); }

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
function rawDataFilteredRows(){ const clientDevices=scopedDevices(); const ids=new Set(clientDevices.map(function(dev){return dev.id;})); const startTime=rawDataFilters.start?new Date(rawDataFilters.start).getTime():null; const endTime=rawDataFilters.end?new Date(rawDataFilters.end).getTime():null; const rows=rawDataHistoryRows.length?window.BSF_MERGE_ROWS(rawDataHistoryRows, rawDataRows):rawDataRows; return rows.filter(function(row){ if(rawDataFilters.client&&!ids.has(row.device))return false; if(rawDataFilters.device&&row.device!==rawDataFilters.device)return false; const time=rawDataTime(row); if(startTime!==null&&time!==null&&time<startTime)return false; if(endTime!==null&&time!==null&&time>endTime)return false; return true; }); }
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
  renderRawData(document.getElementById('page-content'));
}
function rawCsvCell(value){ return '"' + bsfSpreadsheetSafeText(value).replace(/"/g,'""') + '"'; }
function rawDataDisplay(value){ return bsfEscapeHtml(value === undefined || value === null || value === '' ? '—' : value); }
function rawDataToast(message){ let toast=document.getElementById('raw-data-toast'); if(!toast){toast=document.createElement('div');toast.id='raw-data-toast';document.body.appendChild(toast);} toast.textContent=message; toast.style.cssText='position:fixed;top:20px;right:20px;z-index:100000;padding:12px 18px;border-radius:8px;color:#e2e8f0;background:#065f46;border:1px solid #10b981;box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:13px;font-weight:600;'; setTimeout(function(){if(toast)toast.remove();},3000); }
function exportRawDataCsv(){ const rows=rawDataFilteredRows(); const head=['Recorded At','Device','State','Operating','Ferment','Run Time(min)','Weight(kg)','Total Add(kg)','Single Add(kg)','Total Discharge(kg)','Single Discharge(kg)','Discharge','Feed','Shredder','Mixing Motor','Fan','Zipper','Temp(°C)','Hot Plate Temp(°C)','Hum(%)','Energy(kWh)','Solar Power(kW)','CO2(ppm)','NO2(ppm)','H2S(ppm)','Signal']; const body=rows.map(function(row){return [row.recordedAt,row.device,row.deviceState,row.operatingStatus,row.fermentState,row.runTime,row.weight,row.totalAddMaterial,row.singleAddMaterial,row.totalDischarge,row.singleDischarge,row.discharge,row.feed,row.shredder,row.mixingMotor,row.fan,row.zipper,row.temperature,row.hotPlateTemp,row.humidity,row.energy,row.solarPower,row.co2,row.no2,row.h2s,row.signal];}); const csv=[head].concat(body).map(function(row){return row.map(rawCsvCell).join(',');}).join('\r\n'); const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download='bsf-raw-data-'+new Date().toISOString().slice(0,10)+'.csv'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); rawDataToast('Raw Data CSV export started'); }

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
  const filteredRows = rawDataFilteredRows();
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / RAW_DATA_PAGE_SIZE));
  if(rawDataPage > totalPages) rawDataPage = totalPages;
  if(rawDataPage < 1) rawDataPage = 1;
  const startIndex = (rawDataPage - 1) * RAW_DATA_PAGE_SIZE;
  const pageRows = filteredRows.slice(startIndex, startIndex + RAW_DATA_PAGE_SIZE);
  const displayRows = pageRows.map(function(row){
    const safe = Object.assign({}, row);
    ['recordedAt','device','deviceState','operatingStatus','fermentState','runTime','weight','totalAddMaterial','singleAddMaterial','totalDischarge','singleDischarge','discharge','feed','shredder','mixingMotor','fan','zipper','temperature','humidity','energy','solarPower','co2','no2','h2s','signal'].forEach(function(key){ safe[key] = bsfEscapeHtml(row[key]); });
    return safe;
  });
  const rowSummary = filteredRows.length ? 'Showing ' + (startIndex + 1) + '-' + Math.min(startIndex + pageRows.length, filteredRows.length) + ' of ' + filteredRows.length + ' records' : 'No records';
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
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#0f172a;border-bottom:1px solid #334155;">
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Recorded At</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Device</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">State</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Operating</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Ferment</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Run Time(min)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Weight(kg)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Total Add(kg)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Single Add(kg)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Total Discharge(kg)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Single Discharge(kg)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Discharge</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Feed</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Shredder</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Mixing Motor</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Fan</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Zipper</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Temp(°C)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Hot Plate Temp(°C)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Hum(%)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Energy(kWh)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Solar Power(kW)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">CO₂(ppm)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">NO₂(ppm)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">H₂S(ppm)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Signal</th>
            </tr>
          </thead>
          <tbody>
            ${displayRows.map((row,i)=>`
              <tr style="border-bottom:1px solid #334155;background:${i%2===0?'#1e293b':'#1a2332'};">
                <td style="padding:10px 16px;color:#e2e8f0;white-space:nowrap;">${rawDataDisplay(row.recordedAt)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;font-weight:600;">${rawDataDisplay(row.device)}</td>
                <td style="padding:10px 16px;"><span style="padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${row.deviceState==='Running'?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)'};color:${row.deviceState==='Running'?'#10b981':'#f59e0b'};">${rawDataDisplay(row.deviceState)}</span></td>
                <td style="padding:10px 16px;color:#94a3b8;">${rawDataDisplay(row.operatingStatus)}</td>
                <td style="padding:10px 16px;color:#94a3b8;">${rawDataDisplay(row.fermentState)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.runTime)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.weight)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.totalAddMaterial)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.singleAddMaterial)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.totalDischarge)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.singleDischarge)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.discharge)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.feed)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.shredder)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.mixingMotor)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.fan)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.zipper)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.temperature)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.hotPlateTemp)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.humidity)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.energy)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${rawDataDisplay(row.solarPower)}</td>
                <td style="padding:10px 16px;color:${parseFloat(row.co2)>900?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.co2)>900?'700':'400'};">${rawDataDisplay(row.co2)}</td>
                <td style="padding:10px 16px;color:${parseFloat(row.no2)>0.18?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.no2)>0.18?'700':'400'};">${rawDataDisplay(row.no2)}</td>
                <td style="padding:10px 16px;color:${parseFloat(row.h2s)>0.25?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.h2s)>0.25?'700':'400'};">${rawDataDisplay(row.h2s)}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${row.signal === undefined || row.signal === null || row.signal === '' ? '—' : rawDataDisplay(row.signal) + '%'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
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
