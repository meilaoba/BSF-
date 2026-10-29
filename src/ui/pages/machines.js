function machinePreviewEscape(value){
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function machineHasCoordinates(device){
  if(!device) return false;
  const rawLat = device.lat;
  const rawLng = device.lng;
  if(rawLat === null || rawLat === undefined || rawLat === '' || rawLng === null || rawLng === undefined || rawLng === '') return false;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

const machineMetricCache = new Map();
const machineMetricRequests = new Map();
const MACHINE_METRIC_TTL_MS = 60 * 1000;

function machineMetricCard(title, value, unit, color, id){
  return '<div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">' +
    '<p style="font-size:12px;color:#94a3b8;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">' + machinePreviewEscape(title) + '</p>' +
    '<p style="font-size:28px;font-weight:700;color:' + color + ';margin:0;"><span id="' + id + '">' + machinePreviewEscape(value) + '</span><span style="font-size:14px;color:#64748b;margin-left:4px;font-weight:500;">' + machinePreviewEscape(unit) + '</span></p></div>';
}

function machineMetricValue(value){
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(1);
}

function machineMetricIdentity(device){
  return {
    clientId:device.clientId || (device.client && device.client !== 'Unassigned' ? device.client : undefined),
    machineId:device.backendId || device.id || undefined
  };
}

function machineMetricKey(device){
  const identity = machineMetricIdentity(device);
  const today = window.BSF_METRICS && window.BSF_METRICS.hongKongDateKey
    ? window.BSF_METRICS.hongKongDateKey(new Date())
    : new Date().toISOString().slice(0, 10);
  return [identity.clientId || '', identity.machineId || '', today].join('|');
}

function machineMetricCached(device){
  const key = machineMetricKey(device);
  const entry = machineMetricCache.get(key);
  if(!entry) return null;
  if(Date.now() - entry.savedAt > MACHINE_METRIC_TTL_MS){
    machineMetricCache.delete(key);
    return null;
  }
  return entry.data;
}

function machineMetricsMarkup(device){
  const metrics = machineMetricCached(device) || {};
  return [
    machineMetricCard('Accumulated GHG Reduced', machineMetricValue(metrics.ghgKg), 'kg CO₂e', '#10b981', 'machine-metric-ghg'),
    machineMetricCard('Accumulated Waste', machineMetricValue(metrics.wasteKg), 'kg', '#3b82f6', 'machine-metric-waste'),
    machineMetricCard('Est. Fertilizer', machineMetricValue(metrics.fertilizerKg), 'kg', '#f59e0b', 'machine-metric-fertilizer'),
    machineMetricCard('Daily Waste', machineMetricValue(metrics.dailyWasteKg), 'kg', '#8b5cf6', 'machine-metric-daily-waste'),
    ...(isClientScopedRole() ? [] : [machineMetricCard('Daily Energy', machineMetricValue(metrics.dailyEnergyKwh), 'kWh', '#ef4444', 'machine-metric-daily-energy')]),
    machineMetricCard('Avg Env Temp', machineMetricValue(metrics.environmentTempC), '°C', '#22c55e', 'machine-metric-env-temp'),
    machineMetricCard('Container Temp', machinePreviewEscape(device.containerTemp), '°C', '#f97316', 'machine-metric-temp'),
    machineMetricCard('Container Humidity', machinePreviewEscape(device.humidity), '%', '#0ea5e9', 'machine-metric-humidity')
  ].join('');
}

function applyMachineMetricText(id, value){
  const element = document.getElementById(id);
  if(element) element.textContent = machineMetricValue(value);
}

async function loadMachineMetrics(device){
  if(!device || !window.BSF_API || !window.BSF_API_CONFIG || !window.BSF_API_CONFIG.enabled) return;
  const key = machineMetricKey(device);
  if(machineMetricCached(device)) return;
  if(machineMetricRequests.has(key)) return;
  const identity = machineMetricIdentity(device);
  const today = window.BSF_METRICS && window.BSF_METRICS.hongKongDateKey
    ? window.BSF_METRICS.hongKongDateKey(new Date())
    : new Date().toISOString().slice(0, 10);
  const environmentRequest = typeof window.BSF_API.getEnvironmentTemperature === 'function'
    ? window.BSF_API.getEnvironmentTemperature({ date:today }).catch(function(){ return null; })
    : Promise.resolve(null);
  const request = Promise.all([
    window.BSF_API.getGraphs(Object.assign({ period:'monthly' }, identity)),
    window.BSF_API.getGraphs(Object.assign({ period:'daily', date:today }, identity)),
    environmentRequest
  ]).then(function(results){
    const monthlySummary = results[0] && results[0].summary ? results[0].summary : {};
    const dailySummary = results[1] && results[1].summary ? results[1].summary : {};
    const environment = results[2] || {};
    const data = {
      wasteKg:monthlySummary.wasteKg,
      ghgKg:monthlySummary.ghgKg,
      fertilizerKg:monthlySummary.fertilizerKg,
      dailyWasteKg:dailySummary.wasteKg,
      dailyEnergyKwh:dailySummary.energyKwh,
      environmentTempC:environment.temperatureC
    };
    machineMetricCache.set(key, { savedAt:Date.now(), data:data });
    if(currentPage === 'machines' && machineMetricKey(device) === key){
      applyMachineMetricText('machine-metric-ghg', data.ghgKg);
      applyMachineMetricText('machine-metric-waste', data.wasteKg);
      applyMachineMetricText('machine-metric-fertilizer', data.fertilizerKg);
      applyMachineMetricText('machine-metric-daily-waste', data.dailyWasteKg);
      applyMachineMetricText('machine-metric-daily-energy', data.dailyEnergyKwh);
      applyMachineMetricText('machine-metric-env-temp', data.environmentTempC);
    }
  }).catch(function(){
    // Unavailable aggregated metrics remain an em dash.
  }).finally(function(){
    machineMetricRequests.delete(key);
  });
  machineMetricRequests.set(key, request);
  return request;
}
function renderMachines(container){
  const clients = scopedClientNames();
  const clientScoped = isClientScopedRole();
  const clientDevices = scopedDevices();
  const filteredDevices = machineFilters.device
    ? clientDevices.filter(dev=>dev.id===machineFilters.device)
    : clientDevices;
  const d = filteredDevices[0] || null;
  const previewDevices = filteredDevices.filter(machineHasCoordinates);
  const previewLats = previewDevices.map(function(dev){ return Number(dev.lat); });
  const previewLngs = previewDevices.map(function(dev){ return Number(dev.lng); });
  const previewMinLat = previewLats.length ? Math.min.apply(null, previewLats) : 0;
  const previewMaxLat = previewLats.length ? Math.max.apply(null, previewLats) : 0;
  const previewMinLng = previewLngs.length ? Math.min.apply(null, previewLngs) : 0;
  const previewMaxLng = previewLngs.length ? Math.max.apply(null, previewLngs) : 0;
  const previewMarkers = previewDevices.map(function(dev){
    const latRange = previewMaxLat - previewMinLat || 1;
    const lngRange = previewMaxLng - previewMinLng || 1;
    const left = previewDevices.length === 1 ? 50 : 12 + ((Number(dev.lng) - previewMinLng) / lngRange) * 76;
    const top = previewDevices.length === 1 ? 50 : 12 + ((previewMaxLat - Number(dev.lat)) / latRange) * 76;
    const status = String(dev.status || 'offline').toLowerCase();
    const color = status==='online' ? '#10b981' : status==='running' ? '#3b82f6' : status==='standby' ? '#f59e0b' : '#ef4444';
    return '<div title="' + machinePreviewEscape(dev.id) + ' - ' + machinePreviewEscape(status.toUpperCase()) + '" style="position:absolute;top:' + top.toFixed(2) + '%;left:' + left.toFixed(2) + '%;transform:translate(-50%,-50%);width:14px;height:14px;background:' + color + ';border-radius:50%;box-shadow:0 0 0 4px ' + color + '33;border:2px solid #1e293b;"></div>';
  }).join('');
  const previewEmpty = d && !previewDevices.length ? '<p style="color:#64748b;font-size:12px;margin:8px 0 0;">GPS coordinates unavailable</p>' : '';

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Machines Overview</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Latest available readings, updated approximately every 30 minutes</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;align-items:flex-end;">
      ${clientScoped ? clientScopeBadge() : '<label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Client Filter<select onchange="machineFilters.client=this.value;machineFilters.device=\'\';renderMachines(document.getElementById(\'page-content\'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:220px;"><option value="" ' + (machineFilters.client===''?'selected':'') + '>All Clients</option>' + clients.map(function(client){ return '<option value="'+machinePreviewEscape(client)+'" '+(machineFilters.client===client?'selected':'')+'>'+machinePreviewEscape(client)+'</option>'; }).join('') + '</select></label>'}
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        Machine
        <select ${isUserRole()?'disabled':''} onchange="machineFilters.device=this.value;renderMachines(document.getElementById('page-content'));" style="padding:10px 16px;background:${isUserRole()?'#111827':'#1e293b'};border:1px solid #334155;border-radius:8px;color:${isUserRole()?'#94a3b8':'#e2e8f0'};font-size:14px;min-width:220px;cursor:${isUserRole()?'not-allowed':'pointer'};">
          ${isUserRole() ? '' : '<option value="" ' + (machineFilters.device===''?'selected':'') + '>All Machines</option>'}
          ${clientDevices.map(dev=>`<option value="${machinePreviewEscape(dev.id)}" ${machineFilters.device===dev.id?'selected':''}>${machinePreviewEscape(dev.id)} - ${machinePreviewEscape(dev.name)}</option>`).join('')}
        </select>
      </label>
      <div style="display:flex;gap:8px;align-items:center;padding-bottom:11px;">
        <span style="width:10px;height:10px;background:#10b981;border-radius:50%;display:inline-block;"></span>
        <span style="font-size:13px;color:#94a3b8;">${filteredDevices.filter(dev=>dev.status==='online'||dev.status==='running'||dev.status==='standby').length} Online</span>
        <span style="width:10px;height:10px;background:#ef4444;border-radius:50%;display:inline-block;margin-left:12px;"></span>
        <span style="font-size:13px;color:#94a3b8;">${filteredDevices.filter(dev=>dev.status==='offline').length} Offline</span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
      ${d ? machineMetricsMarkup(d) : '<div style="grid-column:1/-1;background:#1e293b;border-radius:12px;padding:28px;text-align:center;color:#64748b;border:1px solid #334155;">No device data available</div>'}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Device Status</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${filteredDevices.length ? filteredDevices.map(dev=>`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#0f172a;border-radius:8px;border:1px solid #334155;">
              <div>
                <p style="margin:0;font-weight:600;color:#f8fafc;font-size:14px;">${machinePreviewEscape(dev.id)}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${machinePreviewEscape(dev.name)}</p>
              </div>
              <div style="text-align:right;">
                <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${dev.status==='online'?'rgba(16,185,129,0.15)':dev.status==='running'?'rgba(59,130,246,0.15)':dev.status==='standby'?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)'};color:${dev.status==='online'?'#10b981':dev.status==='running'?'#3b82f6':dev.status==='standby'?'#f59e0b':'#ef4444'};">${machinePreviewEscape(String(dev.status || '').toUpperCase())}</span>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${machinePreviewEscape(dev.network)} · ${dev.signal === undefined || dev.signal === null || dev.signal === '' ? '—' : machinePreviewEscape(dev.signal) + '%'}</p>
              </div>
            </div>
          `).join('') : '<div style="padding:20px;text-align:center;color:#64748b;font-size:13px;">No devices available</div>'}
        </div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Location Preview</h3>
        <div style="background:#0f172a;border-radius:8px;height:280px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;border:1px solid #334155;">
          <div style="position:absolute;width:100%;height:100%;background:radial-gradient(circle at 30% 40%,rgba(16,185,129,0.15),transparent 50%),radial-gradient(circle at 70% 60%,rgba(59,130,246,0.1),transparent 50%);"></div>
          <div style="text-align:center;position:relative;z-index:1;">
            <div style="font-size:48px;margin-bottom:8px;">📍</div>
            ${d ? '<p style="color:#94a3b8;font-size:13px;margin:0;">' + machinePreviewEscape(d.lat === null || d.lat === undefined || d.lng === null || d.lng === undefined ? '—, —' : d.lat + ', ' + d.lng) + '</p><p style="color:#64748b;font-size:12px;margin:4px 0 0;">Last update: ' + machinePreviewEscape(d.lastUpdate || '—') + '</p>' : '<p style="color:#64748b;font-size:13px;margin:0;">No device location available</p>'}
            ${previewEmpty}
          </div>
          ${previewMarkers}
        </div>
      </div>
    </div>`;
  if(d) loadMachineMetrics(d);
}
