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
  const clientDevices = rawDataFilters.client ? devices.filter(dev=>dev.client===rawDataFilters.client) : devices;
  const selectedDeviceIds = new Set(clientDevices.map(dev=>dev.id));
  const filteredRows = rawDataRows.filter(row => (!rawDataFilters.client || selectedDeviceIds.has(row.device)) && (!rawDataFilters.device || row.device===rawDataFilters.device));
  const rowSummary = (rawDataFilters.client || rawDataFilters.device) ? (filteredRows.length ? 'Showing 1-'+filteredRows.length+' of '+filteredRows.length+' records' : 'No records') : 'Showing 1-15 of 2,847 records';
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Raw Data</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Telemetry and sensor raw records from all connected devices</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        Client Filter
        <select id="raw-client-filter" onchange="rawDataFilters.client=this.value;rawDataFilters.device='';renderRawData(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:240px;"></select>
      </label>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <select id="raw-device-filter" onchange="rawDataFilters.device=this.value;renderRawData(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"></select>
      <input type="datetime-local" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      <input type="datetime-local" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      <button style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Filter</button>
      <button style="padding:10px 20px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-weight:600;font-size:14px;cursor:pointer;">Export CSV</button>
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
            ${filteredRows.map((row,i)=>`
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
        <div style="display:flex;gap:6px;">
          <button style="padding:6px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#64748b;font-size:12px;cursor:pointer;">Prev</button>
          <button style="padding:6px 12px;background:#10b981;border:none;border-radius:6px;color:#fff;font-size:12px;cursor:pointer;font-weight:600;">1</button>
          <button style="padding:6px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#94a3b8;font-size:12px;cursor:pointer;">2</button>
          <button style="padding:6px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#94a3b8;font-size:12px;cursor:pointer;">3</button>
          <button style="padding:6px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#64748b;font-size:12px;cursor:pointer;">Next</button>
        </div>
      </div>
    </div>
  `;
  populateRawDataFilters(clients, clientDevices);
}
