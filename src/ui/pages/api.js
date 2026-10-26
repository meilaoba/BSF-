function renderApi(container){
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">API / Data Sources</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Manage the authenticated vendor API and backend data pipeline</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:flex-end;">
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Client Filter
        <select id="api-client-filter" onchange="apiFilters.client=this.value;apiFilters.machine='';renderApi(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:220px;"></select>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Machine Filter
        <select id="api-machine-filter" onchange="apiFilters.machine=this.value;renderApi(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:220px;"></select>
      </label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Connection Status</h3><button onclick="checkApiConnection()" style="padding:6px 12px;background:#334155;border:none;border-radius:6px;color:#e2e8f0;font-size:12px;cursor:pointer;">Check Connection</button></div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">Vendor REST API</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">Authenticated through the server</p></div>
            <span id="api-vendor-status" style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(100,116,139,0.15);color:#94a3b8;">Checking</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">Platform REST API</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">/api/v1</p></div>
            <span id="api-backend-status" style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(100,116,139,0.15);color:#94a3b8;">Checking</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">Telemetry Pipeline</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">Vendor API → PostgreSQL → Dashboard</p></div>
            <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;">API only</span>
          </div>
        </div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Data Ingestion Stats</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #334155;"><span style="color:#e2e8f0;font-size:13px;">Recent Records</span><span id="api-records" style="color:#f8fafc;font-weight:600;">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #334155;"><span style="color:#e2e8f0;font-size:13px;">Request Latency</span><span id="api-latency" style="color:#64748b;font-weight:600;">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #334155;"><span style="color:#e2e8f0;font-size:13px;">Telemetry Source</span><span id="api-source" style="color:#64748b;font-weight:600;">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;"><span style="color:#e2e8f0;font-size:13px;">Last Data Received</span><span id="api-last-data" style="color:#f8fafc;font-weight:600;">—</span></div>
        </div>
      </div>
    </div>
  `;
  populateApiFilters();
  loadApiConnectionStatus();
}

function setApiStatus(id, online){
  const status = document.getElementById(id);
  if(!status) return;
  status.textContent = online ? 'Connected' : 'Offline';
  status.style.background = online ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
  status.style.color = online ? '#10b981' : '#ef4444';
}

function loadApiConnectionStatus(showToast){
  if(!window.BSF_API) return Promise.resolve(false);
  const started = performance.now();
  setApiStatus('api-vendor-status', false);
  setApiStatus('api-backend-status', false);
  return Promise.allSettled([
    window.BSF_API.health(),
    window.BSF_API.getVendorDevices({ pageNum:1, pageSize:1 })
  ]).then(function(results){
    const backendOk = results[0].status === 'fulfilled' && results[0].value && results[0].value.ok !== false;
    const vendorOk = results[1].status === 'fulfilled';
    setApiStatus('api-backend-status', backendOk);
    setApiStatus('api-vendor-status', vendorOk);
    const records = document.getElementById('api-records');
    const lastData = document.getElementById('api-last-data');
    const latency = document.getElementById('api-latency');
    const source = document.getElementById('api-source');
    if(records) records.textContent = String(rawDataRows.length);
    if(lastData) lastData.textContent = rawDataRows[0] ? rawDataRows[0].recordedAt : '—';
    if(latency) latency.textContent = Math.max(1, Math.round(performance.now() - started)) + 'ms';
    if(source) source.textContent = vendorOk ? 'Vendor API' : 'Unavailable';
    if(showToast && window.BSF_NOTIFICATIONS) window.BSF_NOTIFICATIONS.add({ id:'api-check-' + Date.now(), title:'API connection checked', detail:'Backend: ' + (backendOk ? 'Connected' : 'Offline') + ' · Vendor API: ' + (vendorOk ? 'Connected' : 'Offline'), time:bsfFormatTime(Date.now()/1000), read:false });
    return backendOk && vendorOk;
  }).catch(function(){ return false; });
}
async function checkApiConnection(){ await loadApiConnectionStatus(true); }

function populateApiFilters(){
  const clientSelect = document.getElementById('api-client-filter');
  const machineSelect = document.getElementById('api-machine-filter');
  const clients = [...new Set(devices.map(function(dev){ return dev.client; }))];
  if(clientSelect){
    clientSelect.innerHTML = '<option value="">All Clients</option>' + clients.map(function(client){ return '<option value="'+bsfEscapeHtml(client)+'"'+(apiFilters.client===client?' selected':'')+'>'+bsfEscapeHtml(client)+'</option>'; }).join('');
  }
  const list = apiFilters.client ? devices.filter(function(dev){ return dev.client===apiFilters.client; }) : devices;
  if(machineSelect){
    machineSelect.innerHTML = '<option value="">All Machines</option>' + list.map(function(dev){ return '<option value="'+bsfEscapeHtml(dev.id)+'"'+(apiFilters.machine===dev.id?' selected':'')+'>'+bsfEscapeHtml(dev.id)+'</option>'; }).join('');
  }
}
