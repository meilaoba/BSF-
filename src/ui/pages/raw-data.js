
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
function rawDataFilteredRows(){ const clientDevices=rawDataFilters.client?devices.filter(function(dev){return dev.client===rawDataFilters.client;}):devices; const ids=new Set(clientDevices.map(function(dev){return dev.id;})); const startTime=rawDataFilters.start?new Date(rawDataFilters.start).getTime():null; const endTime=rawDataFilters.end?new Date(rawDataFilters.end).getTime():null; return rawDataRows.filter(function(row){ if(rawDataFilters.client&&!ids.has(row.device))return false; if(rawDataFilters.device&&row.device!==rawDataFilters.device)return false; const time=rawDataTime(row); if(startTime!==null&&time!==null&&time<startTime)return false; if(endTime!==null&&time!==null&&time>endTime)return false; return true; }); }
function applyRawDataFilter(){ rawDataFilters.start=(document.getElementById('raw-start-filter')||{}).value||''; rawDataFilters.end=(document.getElementById('raw-end-filter')||{}).value||''; rawDataPage=1; renderRawData(document.getElementById('page-content')); }
function rawCsvCell(value){ return '"' + String(value===undefined||value===null?'':value).replace(/"/g,'""') + '"'; }
function rawDataToast(message){ let toast=document.getElementById('raw-data-toast'); if(!toast){toast=document.createElement('div');toast.id='raw-data-toast';document.body.appendChild(toast);} toast.textContent=message; toast.style.cssText='position:fixed;top:20px;right:20px;z-index:100000;padding:12px 18px;border-radius:8px;color:#e2e8f0;background:#065f46;border:1px solid #10b981;box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:13px;font-weight:600;'; setTimeout(function(){if(toast)toast.remove();},3000); }
function exportRawDataCsv(){ const rows=rawDataFilteredRows(); const head=['Recorded At','Device','State','Ferment','Weight(kg)','Temp(°C)','Hum(%)','Energy(kWh)','CO2(ppm)','NO2(ppm)','H2S(ppm)','Signal']; const body=rows.map(function(row){return [row.recordedAt,row.device,row.deviceState,row.fermentState,row.weight,row.temperature,row.humidity,row.energy,row.co2,row.no2,row.h2s,row.signal];}); const csv=[head].concat(body).map(function(row){return row.map(rawCsvCell).join(',');}).join('\r\n'); const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download='bsf-raw-data-'+new Date().toISOString().slice(0,10)+'.csv'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); rawDataToast('Raw Data CSV export started'); }

function populateRawDataFilters(clients, clientDevices){
  const clientSelect = document.getElementById('raw-client-filter');
  const deviceSelect = document.getElementById('raw-device-filter');
  if(clientSelect){
    clientSelect.innerHTML = '<option value="">All Clients</option>' + clients.map(client=>'<option value="'+client+'"'+(rawDataFilters.client===client?' selected':'')+'>'+client+'</option>').join('');
  }
  if(deviceSelect){
    deviceSelect.innerHTML = '<option value="">All Devices</option>' + clientDevices.map(dev=>'<option value="'+dev.id+'"'+(rawDataFilters.device===dev.id?' selected':'')+'>'+dev.id+'</option>').join('');
  }
}
function renderRawData(container){
  const clients = [...new Set(devices.map(dev=>dev.client))];
  const filteredRows = rawDataFilteredRows();
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / RAW_DATA_PAGE_SIZE));
  if(rawDataPage > totalPages) rawDataPage = totalPages;
  if(rawDataPage < 1) rawDataPage = 1;
  const startIndex = (rawDataPage - 1) * RAW_DATA_PAGE_SIZE;
  const pageRows = filteredRows.slice(startIndex, startIndex + RAW_DATA_PAGE_SIZE);
  const rowSummary = filteredRows.length ? 'Showing ' + (startIndex + 1) + '-' + Math.min(startIndex + pageRows.length, filteredRows.length) + ' of ' + filteredRows.length + ' records' : 'No records';
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Raw Data</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Telemetry and sensor raw records from all connected devices</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        Client Filter
        <select id="raw-client-filter" onchange="rawDataFilters.client=this.value;rawDataFilters.device='';rawDataPage=1;renderRawData(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:240px;"></select>
      </label>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <select id="raw-device-filter" onchange="rawDataFilters.device=this.value;rawDataPage=1;renderRawData(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"></select>
      <input id="raw-start-filter" type="datetime-local" value="${rawDataFilters.start || ''}" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      <input id="raw-end-filter" type="datetime-local" value="${rawDataFilters.end || ''}" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      <button style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="applyRawDataFilter()">Filter</button>
      <button style="padding:10px 20px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-weight:600;font-size:14px;cursor:pointer;" onclick="exportRawDataCsv()">Export CSV</button>
    </div>
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#0f172a;border-bottom:1px solid #334155;">
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Recorded At</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Device</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">State</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Ferment</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Weight(kg)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Temp(°C)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Hum(%)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Energy(kWh)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">CO₂(ppm)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">NO₂(ppm)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">H₂S(ppm)</th>
              <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-weight:600;white-space:nowrap;">Signal</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map((row,i)=>`
              <tr style="border-bottom:1px solid #334155;background:${i%2===0?'#1e293b':'#1a2332'};">
                <td style="padding:10px 16px;color:#e2e8f0;white-space:nowrap;">${row.recordedAt}</td>
                <td style="padding:10px 16px;color:#e2e8f0;font-weight:600;">${row.device}</td>
                <td style="padding:10px 16px;"><span style="padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${row.deviceState==='Running'?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)'};color:${row.deviceState==='Running'?'#10b981':'#f59e0b'};">${row.deviceState}</span></td>
                <td style="padding:10px 16px;color:#94a3b8;">${row.fermentState}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${row.weight}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${row.temperature}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${row.humidity}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${row.energy}</td>
                <td style="padding:10px 16px;color:${parseFloat(row.co2)>900?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.co2)>900?'700':'400'};">${row.co2}</td>
                <td style="padding:10px 16px;color:${parseFloat(row.no2)>0.18?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.no2)>0.18?'700':'400'};">${row.no2}</td>
                <td style="padding:10px 16px;color:${parseFloat(row.h2s)>0.25?'#ef4444':'#e2e8f0'};font-weight:${parseFloat(row.h2s)>0.25?'700':'400'};">${row.h2s}</td>
                <td style="padding:10px 16px;color:#e2e8f0;">${row.signal}%</td>
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
}
