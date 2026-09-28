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

function renderMachines(container){
  const clients = scopedClientNames();
  const clientScoped = isClientScopedRole();
  const clientDevices = scopedDevices();
  const filteredDevices = machineFilters.device
    ? clientDevices.filter(dev=>dev.id===machineFilters.device)
    : clientDevices;
  const d = filteredDevices[0] || devices[0];
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
  const previewEmpty = previewDevices.length ? '' : '<p style="color:#64748b;font-size:12px;margin:8px 0 0;">GPS coordinates unavailable</p>';

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Machines Overview</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Real-time monitoring of all connected kitchen waste units</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;align-items:flex-end;">
      ${clientScoped ? clientScopeBadge() : '<label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Client Filter<select onchange="machineFilters.client=this.value;machineFilters.device=\'\';renderMachines(document.getElementById(\'page-content\'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:220px;"><option value="" ' + (machineFilters.client===''?'selected':'') + '>All Clients</option>' + clients.map(function(client){ return '<option value="'+client+'" '+(machineFilters.client===client?'selected':'')+'>'+client+'</option>'; }).join('') + '</select></label>'}
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        Machine
        <select ${isUserRole()?'disabled':''} onchange="machineFilters.device=this.value;renderMachines(document.getElementById('page-content'));" style="padding:10px 16px;background:${isUserRole()?'#111827':'#1e293b'};border:1px solid #334155;border-radius:8px;color:${isUserRole()?'#94a3b8':'#e2e8f0'};font-size:14px;min-width:220px;cursor:${isUserRole()?'not-allowed':'pointer'};">
          ${isUserRole() ? '' : '<option value="" ' + (machineFilters.device===''?'selected':'') + '>All Machines</option>'}
          ${clientDevices.map(dev=>`<option value="${dev.id}" ${machineFilters.device===dev.id?'selected':''}>${dev.id} - ${dev.name}</option>`).join('')}
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
      ${card('Accumulated GHG Reduced', d.ghgReduced, 'kg CO₂e', '#10b981')}
      ${card('Accumulated Waste', d.wasteCollected, 'kg', '#3b82f6')}
      ${card('Est. Fertilizer', d.fertilizer, 'kg', '#f59e0b')}
      ${card('Daily Waste', d.dailyWaste, 'kg', '#8b5cf6')}
      ${card('Daily Energy', d.dailyEnergy, 'kWh', '#ef4444')}
      ${card('Avg Env Temp', d.avgTemp, '°C', '#06b6d4')}
      ${card('Container Temp', d.containerTemp, '°C', '#f97316')}
      ${card('Container Humidity', d.humidity, '%', '#0ea5e9')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Device Status</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${filteredDevices.map(dev=>`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#0f172a;border-radius:8px;border:1px solid #334155;">
              <div>
                <p style="margin:0;font-weight:600;color:#f8fafc;font-size:14px;">${dev.id}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${dev.name}</p>
              </div>
              <div style="text-align:right;">
                <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${dev.status==='online'?'rgba(16,185,129,0.15)':dev.status==='running'?'rgba(59,130,246,0.15)':dev.status==='standby'?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)'};color:${dev.status==='online'?'#10b981':dev.status==='running'?'#3b82f6':dev.status==='standby'?'#f59e0b':'#ef4444'};">${dev.status.toUpperCase()}</span>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${dev.network} · ${dev.signal}%</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Location Preview</h3>
        <div style="background:#0f172a;border-radius:8px;height:280px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;border:1px solid #334155;">
          <div style="position:absolute;width:100%;height:100%;background:radial-gradient(circle at 30% 40%,rgba(16,185,129,0.15),transparent 50%),radial-gradient(circle at 70% 60%,rgba(59,130,246,0.1),transparent 50%);"></div>
          <div style="text-align:center;position:relative;z-index:1;">
            <div style="font-size:48px;margin-bottom:8px;">📍</div>
            <p style="color:#94a3b8;font-size:13px;margin:0;">${(d.lat === null || d.lng === null) ? '—, —' : d.lat + ', ' + d.lng}</p>
            <p style="color:#64748b;font-size:12px;margin:4px 0 0;">Last update: ${d.lastUpdate}</p>
            ${previewEmpty}
          </div>
          ${previewMarkers}
        </div>
      </div>
    </div>
  `;
}
