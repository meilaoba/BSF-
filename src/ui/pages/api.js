const API_TEMPLATE_PAGE_SIZE = 10;
const apiTemplateState = {
  page: 1,
  items: [],
  pagination: {
    current: 1,
    size: API_TEMPLATE_PAGE_SIZE,
    total: 0,
    pages: 0
  },
  loading: false,
  loaded: false,
  error: '',
  requestKey: ''
};

function apiTemplateDisplayType(value){
  return ({
    0: 'Switch',
    1: 'Fault light',
    2: 'Value',
    3: 'Status light'
  })[Number(value)] || '—';
}

function apiTemplateChangeText(value){
  if(Number(value) === 1) return 'Report changes';
  if(Number(value) === 0) return 'No change report';
  return '—';
}

function apiTemplateCustomizeText(values){
  if(!Array.isArray(values) || !values.length) return '—';
  return values.map(function(item){
    const label = item && item.label ? item.label : 'Status';
    const value = item && item.value !== undefined && item.value !== null ? item.value : '—';
    const color = item && item.color ? ' [' + item.color + ']' : '';
    return label + ': ' + value + color;
  }).join(', ');
}

function apiTemplatePointRows(template){
  const points = Array.isArray(template && template.points) ? template.points.slice() : [];
  points.sort(function(left, right){
    return (Number(left.sort) || 0) - (Number(right.sort) || 0);
  });
  if(!points.length){
    return '<tr><td colspan="8" style="padding:16px;color:#64748b;">No template points</td></tr>';
  }
  return points.map(function(point){
    return '<tr style="border-top:1px solid #334155;">' +
      '<td style="padding:10px 12px;color:#f8fafc;font-weight:600;">' + bsfEscapeHtml(point.sensorName || point.keyName || '—') +
        '<span style="display:block;color:#64748b;font-weight:400;font-size:10px;">Point ID: ' + bsfEscapeHtml(point.id ?? '—') +
        ' · Icon: ' + bsfEscapeHtml(point.iconId ?? '—') + ' · Template: ' + bsfEscapeHtml(point.templateId ?? '—') + '</span></td>' +
      '<td style="padding:10px 12px;color:#94a3b8;font-family:monospace;">' + bsfEscapeHtml(point.keyName || '—') + '</td>' +
      '<td style="padding:10px 12px;color:#94a3b8;">' + bsfEscapeHtml(point.dataType ?? '—') + '</td>' +
      '<td style="padding:10px 12px;color:#e2e8f0;">' + bsfEscapeHtml(point.unit || '—') + '</td>' +
      '<td style="padding:10px 12px;color:#94a3b8;">' + bsfEscapeHtml(apiTemplateDisplayType(point.showType)) + '</td>' +
      '<td style="padding:10px 12px;color:#94a3b8;">' + bsfEscapeHtml(apiTemplateChangeText(point.reportsChanges)) + '</td>' +
      '<td style="padding:10px 12px;color:#94a3b8;">' + bsfEscapeHtml(point.sort ?? '—') + '</td>' +
      '<td style="padding:10px 12px;color:#64748b;">' + bsfEscapeHtml(apiTemplateCustomizeText(point.customize)) + '</td>' +
    '</tr>';
  }).join('');
}

function apiTemplateCardMarkup(template){
  const name = template && template.templateName || 'Unnamed template';
  const pointCount = template && Array.isArray(template.points) ? template.points.length : 0;
  return '<article style="background:#0f172a;border:1px solid #334155;border-radius:10px;overflow:hidden;">' +
    '<header style="display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px 16px;background:#172033;">' +
      '<div><h4 style="margin:0;color:#f8fafc;font-size:15px;">' + bsfEscapeHtml(name) + '</h4>' +
      '<p style="margin:4px 0 0;color:#64748b;font-size:11px;">Template ID: ' + bsfEscapeHtml((template && template.id) ?? '—') + '</p></div>' +
      '<span style="padding:4px 9px;border-radius:12px;background:rgba(59,130,246,.15);color:#60a5fa;font-size:11px;">' + pointCount + ' points</span>' +
    '</header>' +
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">' +
      '<thead><tr style="color:#94a3b8;text-align:left;background:#111827;">' +
        '<th style="padding:9px 12px;">Sensor</th><th style="padding:9px 12px;">Key</th><th style="padding:9px 12px;">Data type</th>' +
        '<th style="padding:9px 12px;">Unit</th><th style="padding:9px 12px;">Display</th><th style="padding:9px 12px;">Reporting</th>' +
        '<th style="padding:9px 12px;">Sort</th><th style="padding:9px 12px;">Custom states</th>' +
      '</tr></thead><tbody>' + apiTemplatePointRows(template) + '</tbody>' +
    '</table></div></article>';
}

function apiTemplatePaginationMarkup(){
  const pagination = apiTemplateState.pagination || {};
  const current = Math.max(1, Number(pagination.current) || apiTemplateState.page);
  const pages = Math.max(0, Number(pagination.pages) || 0);
  const total = Math.max(0, Number(pagination.total) || 0);
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">' +
    '<span style="color:#64748b;font-size:12px;">' + total + ' templates · page ' + current + (pages ? ' of ' + pages : '') + '</span>' +
    '<div style="display:flex;gap:8px;">' +
      '<button type="button" onclick="setApiTemplatePage(' + (current - 1) + ')" ' + (apiTemplateState.loading || current <= 1 ? 'disabled' : '') + ' style="padding:7px 12px;background:#334155;border:none;border-radius:6px;color:#e2e8f0;font-size:12px;cursor:pointer;">Previous</button>' +
      '<button type="button" onclick="setApiTemplatePage(' + (current + 1) + ')" ' + (apiTemplateState.loading || !pages || current >= pages ? 'disabled' : '') + ' style="padding:7px 12px;background:#334155;border:none;border-radius:6px;color:#e2e8f0;font-size:12px;cursor:pointer;">Next</button>' +
    '</div></div>';
}

function apiTemplateSectionMarkup(){
  let body = '';
  if(apiTemplateState.loading){
    body = '<p style="margin:0;color:#94a3b8;font-size:13px;">Loading vendor templates...</p>';
  } else if(apiTemplateState.error){
    body = '<p role="alert" style="margin:0;color:#f59e0b;font-size:13px;">' + bsfEscapeHtml(apiTemplateState.error) + '</p>';
  } else if(!apiTemplateState.items.length){
    body = '<p style="margin:0;color:#64748b;font-size:13px;">No vendor templates returned.</p>';
  } else {
    body = '<div style="display:flex;flex-direction:column;gap:14px;">' + apiTemplateState.items.map(apiTemplateCardMarkup).join('') + '</div>';
  }
  return '<section id="api-template-section" style="margin-top:24px;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">' +
      '<div><h3 style="margin:0;color:#e2e8f0;font-size:16px;">Vendor Templates</h3><p style="margin:5px 0 0;color:#64748b;font-size:12px;">Template points and display metadata returned by the vendor API</p></div>' +
      '<button type="button" onclick="refreshApiTemplates()" ' + (apiTemplateState.loading ? 'disabled' : '') + ' style="padding:8px 14px;background:#334155;border:none;border-radius:7px;color:#e2e8f0;font-size:12px;cursor:pointer;">Refresh</button>' +
    '</div>' + body + '<div style="margin-top:16px;">' + apiTemplatePaginationMarkup() + '</div></section>';
}

function renderApiTemplateSection(){
  const section = document.getElementById('api-template-section');
  if(!section) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = apiTemplateSectionMarkup();
  section.replaceWith(wrapper.firstElementChild);
}

async function loadApiTemplates(force = false){
  if(!window.BSF_API || typeof window.BSF_API.getVendorTemplates !== 'function'){
    apiTemplateState.error = 'Vendor template API is unavailable';
    renderApiTemplateSection();
    return;
  }
  const key = apiTemplateState.page + '|' + API_TEMPLATE_PAGE_SIZE;
  if(apiTemplateState.loading && apiTemplateState.requestKey === key) return;
  if(!force && apiTemplateState.loaded && apiTemplateState.requestKey === key) return;
  apiTemplateState.loading = true;
  apiTemplateState.error = '';
  apiTemplateState.requestKey = key;
  renderApiTemplateSection();
  try {
    const result = await window.BSF_API.getVendorTemplates({
      pageNum:apiTemplateState.page,
      pageSize:API_TEMPLATE_PAGE_SIZE
    });
    if(apiTemplateState.requestKey !== key) return;
    apiTemplateState.items = Array.isArray(result && result.templates) ? result.templates : [];
    apiTemplateState.pagination = result && result.pagination ? result.pagination : {
      current:apiTemplateState.page,
      size:API_TEMPLATE_PAGE_SIZE,
      total:apiTemplateState.items.length,
      pages:apiTemplateState.items.length === API_TEMPLATE_PAGE_SIZE ? apiTemplateState.page + 1 : apiTemplateState.page
    };
    apiTemplateState.loaded = true;
  } catch(error) {
    if(apiTemplateState.requestKey !== key) return;
    apiTemplateState.items = [];
    apiTemplateState.error = error && error.message ? error.message : 'Vendor templates could not be loaded';
    apiTemplateState.loaded = false;
  } finally {
    if(apiTemplateState.requestKey === key){
      apiTemplateState.loading = false;
      renderApiTemplateSection();
    }
  }
}

function setApiTemplatePage(page){
  const next = Math.max(1, Number(page) || 1);
  if(next === apiTemplateState.page && apiTemplateState.loaded) return;
  apiTemplateState.page = next;
  apiTemplateState.loaded = false;
  loadApiTemplates(true);
}

function refreshApiTemplates(){
  apiTemplateState.loaded = false;
  loadApiTemplates(true);
}

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
    ${apiTemplateSectionMarkup()}
  `;
  populateApiFilters();
  loadApiConnectionStatus();
  loadApiTemplates();
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
