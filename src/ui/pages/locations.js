function loadGoogleMapsApi(){
  if(!GOOGLE_MAPS_API_KEY) return Promise.resolve(null);
  if(window.google && window.google.maps) return Promise.resolve(window.google.maps);
  if(googleMapsLoading) return googleMapsLoading;

  googleMapsLoading = new Promise((resolve,reject)=>{
    const callbackName = '__bsfGoogleMapsReady';
    window[callbackName] = ()=>{
      delete window[callbackName];
      resolve(window.google.maps);
    };
    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GOOGLE_MAPS_API_KEY) + '&callback=' + callbackName;
    script.async = true;
    script.defer = true;
    script.onerror = ()=>reject(new Error('Google Maps 加载失败'));
    document.head.appendChild(script);
  });
  return googleMapsLoading;
}

async function initGoogleMapLocations(visibleDevices){
  const canvas = document.getElementById('locations-map-canvas');
  if(!canvas) return;

  const maps = await loadGoogleMapsApi();
  if(!maps) return;

  const positioned = visibleDevices.filter(function(device){
    return Number.isFinite(Number(device.lat)) && Number.isFinite(Number(device.lng));
  });
  if(!positioned.length) return;

  const bg = document.getElementById('locations-map-static-bg');
  if(bg) bg.remove();
  document.querySelectorAll('.locations-static-marker').forEach(function(el){ el.remove(); });

  const center = { lat:Number(positioned[0].lat), lng:Number(positioned[0].lng) };
  if(locationsMap){
    locationsMarkers.forEach(function(marker){ marker.setMap(null); });
    locationsMarkers = [];
    locationsMap.setCenter(center);
  } else {
    locationsMap = new window.google.maps.Map(canvas, {
      center,
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });
  }

  const colorOf = function(status){
    return status==='online' ? '#10b981' : status==='running' ? '#3b82f6' : status==='standby' ? '#f59e0b' : '#ef4444';
  };
  positioned.forEach(function(dev){
    const marker = new window.google.maps.Marker({
      position:{ lat:Number(dev.lat), lng:Number(dev.lng) },
      map: locationsMap,
      title: bsfEscapeHtml(dev.id) + ' - ' + bsfEscapeHtml(dev.status.toUpperCase()),
      icon:{
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: colorOf(dev.status),
        fillOpacity: 1,
        strokeColor: '#1e293b',
        strokeWeight: 3,
        scale: 8
      }
    });
    const info = new window.google.maps.InfoWindow({
      content: '<div style="color:#0f172a;font-size:13px;"><b>' + bsfEscapeHtml(dev.id) + '</b><br>' + bsfEscapeHtml(dev.client) + '<br>' + bsfEscapeHtml(dev.status.toUpperCase()) + '</div>'
    });
    marker.addListener('click', function(){ info.open({ anchor:marker, map:locationsMap }); });
    locationsMarkers.push(marker);
  });
}

function setLocationFilter(key, value){
  locationFilters[key] = value || '';
  renderLocations(document.getElementById('page-content'));
}

function setLocationSearch(value){
  locationFilters.search = value || '';
  renderLocations(document.getElementById('page-content'));
  const input = document.getElementById('location-search');
  if(input){
    input.focus();
    const position = input.value.length;
    try { input.setSelectionRange(position, position); } catch(error) {}
  }
}

function renderLocations(container){
  const locationDevices = scopedDevices();
  const clientScoped = isClientScopedRole();
  const clientNames = scopedClientNames();
  const searchText = String(locationFilters.search || '').trim().toLowerCase();
  const filteredDevices = locationDevices.filter(function(dev){
    const client = dev.client || 'Unassigned';
    const status = String(dev.status || '').toLowerCase();
    if(locationFilters.client && client !== locationFilters.client) return false;
    if(locationFilters.status && status !== locationFilters.status) return false;
    if(searchText){
      const id = String(dev.id || '').toLowerCase();
      const name = String(dev.name || '').toLowerCase();
      if(id.indexOf(searchText) < 0 && name.indexOf(searchText) < 0) return false;
    }
    return true;
  });
  const positioned = filteredDevices.filter(function(dev){
    return Number.isFinite(Number(dev.lat)) && Number.isFinite(Number(dev.lng));
  });
  const markerHtml = positioned.map(function(dev, index){
    const top = 25 + (index % 4) * 15;
    const left = 30 + (index % 5) * 12;
    const color = dev.status==='online' ? '#10b981' : dev.status==='running' ? '#3b82f6' : dev.status==='standby' ? '#f59e0b' : '#ef4444';
    return '<div class="locations-static-marker" style="position:absolute;top:'+top+'%;left:'+left+'%;width:18px;height:18px;background:'+color+';border-radius:50%;box-shadow:0 0 0 6px '+color+'33;border:3px solid #1e293b;cursor:pointer;" title="'+bsfEscapeHtml(dev.id)+' - '+bsfEscapeHtml(dev.status.toUpperCase())+'"></div>';
  }).join('');
  let mapNotice = '';
  if(!filteredDevices.length){
    mapNotice = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;"><div style="font-size:40px;margin-bottom:8px;">📍</div><p style="margin:0;font-size:13px;">No devices match the selected filters</p></div>';
  } else if(!positioned.length){
    mapNotice = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;"><div style="font-size:40px;margin-bottom:8px;">📍</div><p style="margin:0;font-size:13px;">GPS coordinates are not provided by device data</p></div>';
  }
  const clientFilterMarkup = clientScoped
    ? clientScopeBadge()
    : '<select id="location-client-filter" onchange="setLocationFilter(\'client\',this.value)" style="padding:10px 16px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option value=""' + (locationFilters.client ? '' : ' selected') + '>All Clients</option>' + clientNames.map(function(client){
        return '<option value="' + bsfEscapeHtml(client) + '"' + (locationFilters.client === client ? ' selected' : '') + '>' + bsfEscapeHtml(client) + '</option>';
      }).join('') + '</select>';
  const statusOptions = ['', 'online', 'running', 'standby', 'offline'].map(function(value){
    const label = value ? value.charAt(0).toUpperCase() + value.slice(1) : 'All';
    return '<option value="' + value + '"' + (locationFilters.status === value ? ' selected' : '') + '>' + label + '</option>';
  }).join('');
  const cards = filteredDevices.length ? filteredDevices.map(function(dev){
    return `<div style="background:#1e293b;border-radius:12px;padding:16px;border:1px solid #334155;">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;">
        <div>
          <p style="margin:0;font-weight:700;color:#f8fafc;font-size:15px;">${bsfEscapeHtml(dev.id)}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${bsfEscapeHtml(dev.name)}</p>
        </div>
        <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${dev.status==='online'?'rgba(16,185,129,0.15)':dev.status==='running'?'rgba(59,130,246,0.15)':dev.status==='standby'?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)'};color:${dev.status==='online'?'#10b981':dev.status==='running'?'#3b82f6':dev.status==='standby'?'#f59e0b':'#ef4444'};">${bsfEscapeHtml(String(dev.status).toUpperCase())}</span>
      </div>
      <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;"><span style="color:#64748b;">Lat:</span> ${dev.lat === null || dev.lat === undefined ? '—' : bsfEscapeHtml(dev.lat)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;"><span style="color:#64748b;">Lng:</span> ${dev.lng === null || dev.lng === undefined ? '—' : bsfEscapeHtml(dev.lng)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;"><span style="color:#64748b;">Client:</span> ${bsfEscapeHtml(dev.client)}</p>
      <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Last update: ${bsfEscapeHtml(dev.lastUpdate)}</p>
    </div>`;
  }).join('') : '<div style="grid-column:1/-1;background:#1e293b;border-radius:12px;padding:32px;text-align:center;color:#64748b;border:1px solid #334155;">No devices match the selected filters</div>';
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Device Locations</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">GPS tracking and geographic distribution of all units</p>
    </div>
    <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:20px;">
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        ${clientFilterMarkup}
        <select id="location-status-filter" onchange="setLocationFilter('status',this.value)" style="padding:10px 16px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">${statusOptions}</select>
        <input id="location-search" type="text" value="${bsfEscapeHtml(locationFilters.search || '')}" placeholder="Search device..." oninput="setLocationSearch(this.value)" style="padding:10px 16px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:200px;" />
      </div>
      <div id="locations-map-canvas" style="background:#0f172a;border-radius:8px;height:480px;position:relative;overflow:hidden;border:1px solid #334155;">
        <div id="locations-map-static-bg" style="position:absolute;width:100%;height:100%;background:linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%);"></div>
        ${markerHtml}${mapNotice}
        <div style="position:absolute;bottom:20px;left:20px;background:rgba(30,41,59,0.95);padding:12px 16px;border-radius:8px;border:1px solid #334155;">
          <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;font-weight:600;">Legend</p>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <span style="font-size:12px;color:#e2e8f0;"><span style="width:10px;height:10px;background:#10b981;border-radius:50%;display:inline-block;margin-right:8px;"></span>Online</span>
            <span style="font-size:12px;color:#e2e8f0;"><span style="width:10px;height:10px;background:#3b82f6;border-radius:50%;display:inline-block;margin-right:8px;"></span>Running</span>
            <span style="font-size:12px;color:#e2e8f0;"><span style="width:10px;height:10px;background:#f59e0b;border-radius:50%;display:inline-block;margin-right:8px;"></span>Standby</span>
            <span style="font-size:12px;color:#e2e8f0;"><span style="width:10px;height:10px;background:#ef4444;border-radius:50%;display:inline-block;margin-right:8px;"></span>Offline</span>
          </div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">${cards}</div>
  `;
  initGoogleMapLocations(filteredDevices);
}
