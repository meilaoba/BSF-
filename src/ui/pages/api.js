function renderApi(container){
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">API / Data Sources</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Manage device API connections and data ingestion endpoints</p>
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
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Connection Status</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">MQTT Broker</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">Configured in bms_mos.exe</p></div>
            <span id="api-gateway-status" style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(100,116,139,0.15);color:#94a3b8;">Checking</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">REST API</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">/api/v1</p></div>
            <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;">Active</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">Webhook</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">Not configured</p></div>
            <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#64748b;">Not configured</span>
          </div>
        </div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Data Ingestion Stats</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #334155;"><span style="color:#e2e8f0;font-size:13px;">Messages Today</span><span id="api-records" style="color:#f8fafc;font-weight:600;">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #334155;"><span style="color:#e2e8f0;font-size:13px;">Avg Latency</span><span style="color:#64748b;font-weight:600;">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #334155;"><span style="color:#e2e8f0;font-size:13px;">Success Rate</span><span style="color:#64748b;font-weight:600;">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;"><span style="color:#e2e8f0;font-size:13px;">Last Data Received</span><span id="api-last-data" style="color:#f8fafc;font-weight:600;">—</span></div>
        </div>
      </div>
    </div>
  `;
  populateApiFilters();
  loadApiGatewayStatus();
}

function loadApiGatewayStatus(){
  if(!window.BSF_GATEWAY) return;
  Promise.all([window.BSF_GATEWAY.health(), window.BSF_GATEWAY.latest()]).then(function(result){
    const health = result[0] || {};
    const latest = result[1] || {};
    const status = document.getElementById('api-gateway-status');
    const records = document.getElementById('api-records');
    const lastData = document.getElementById('api-last-data');
    if(status){ status.textContent = health.status === 'up' ? 'Connected' : 'Offline'; status.style.background = health.status === 'up' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'; status.style.color = health.status === 'up' ? '#10b981' : '#ef4444'; }
    if(records) records.textContent = health.records !== undefined ? health.records : '—';
    if(lastData) lastData.textContent = latest.timestamp ? bsfFormatTime(latest.timestamp) : '—';
  }).catch(function(){});
}
function populateApiFilters(){
  const clientSelect = document.getElementById('api-client-filter');
  const machineSelect = document.getElementById('api-machine-filter');
  const clients = [...new Set(devices.map(function(dev){ return dev.client; }))];
  if(clientSelect){
    clientSelect.innerHTML = '<option value="">All Clients</option>' + clients.map(function(client){ return '<option value="'+client+'"'+(apiFilters.client===client?' selected':'')+'>'+client+'</option>'; }).join('');
  }
  const list = apiFilters.client ? devices.filter(function(dev){ return dev.client===apiFilters.client; }) : devices;
  if(machineSelect){
    machineSelect.innerHTML = '<option value="">All Machines</option>' + list.map(function(dev){ return '<option value="'+dev.id+'"'+(apiFilters.machine===dev.id?' selected':'')+'>'+dev.id+'</option>'; }).join('');
  }
}
