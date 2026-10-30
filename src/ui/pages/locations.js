function locationStatusValue(status){
  const normalized = String(status || 'offline').toLowerCase();
  return normalized === 'running' || normalized === 'standby' ? normalized : 'offline';
}

function locationStatusColor(status){
  const normalized = locationStatusValue(status);
  if(normalized === 'running') return '#3b82f6';
  if(normalized === 'standby') return '#f59e0b';
  return '#ef4444';
}

function locationValidCoordinate(lat, lng){
  if(lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return false;
  const latitude = Number(lat);
  const longitude = Number(lng);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function locationProfile(device){
  const client = String(device && device.client || 'Unassigned');
  if(client.trim().toLowerCase() === 'cic zero carbon park'){
    return {
      lat:22.32408856041477,
      lng:114.20885238603694,
      address:'86C5+CG  九龍灣',
      mapsUrl:'https://maps.app.goo.gl/vpC1AqB7YQZvWmch7',
      poweredBy:'iBrain Tech'
    };
  }
  const lat = device ? device.lat : null;
  const lng = device ? device.lng : null;
  const positioned = locationValidCoordinate(lat, lng);
  return {
    lat:positioned ? Number(lat) : null,
    lng:positioned ? Number(lng) : null,
    address:device && device.location ? String(device.location) : '',
    mapsUrl:positioned ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(Number(lat) + ',' + Number(lng)) : '',
    poweredBy:'iBrain Tech'
  };
}

function locationMapsUrl(device){ return locationProfile(device).mapsUrl; }
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

  const positioned = (visibleDevices || []).map(function(device){
    const profile = locationProfile(device);
    return { device:device, lat:profile.lat, lng:profile.lng };
  }).filter(function(item){ return locationValidCoordinate(item.lat, item.lng); });
  if(!positioned.length) return;

  const bg = document.getElementById('locations-map-static-bg');
  if(bg) bg.remove();
  document.querySelectorAll('.locations-static-marker').forEach(function(el){ el.remove(); });
  if(locationsMap){
    locationsMarkers.forEach(function(marker){ marker.setMap(null); });
    locationsMarkers = [];
    locationsMap = null;
  }

  const center = { lat:positioned[0].lat, lng:positioned[0].lng };
  locationsMap = new window.google.maps.Map(canvas, {
    center,
    zoom:positioned.length === 1 ? 15 : 11,
    mapTypeControl:false,
    streetViewControl:false,
    fullscreenControl:true
  });

  positioned.forEach(function(item){
    const dev = item.device;
    const mapsUrl = locationMapsUrl(dev);
    const marker = new window.google.maps.Marker({
      position:{ lat:item.lat, lng:item.lng },
      map: locationsMap,
      title: bsfEscapeHtml(dev.id) + ' - ' + bsfEscapeHtml(String(dev.status || 'offline').toUpperCase()),
      icon:{
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: locationStatusColor(dev.status),
        fillOpacity: 1,
        strokeColor: '#1e293b',
        strokeWeight: 3,
        scale: 8
      }
    });
    const info = new window.google.maps.InfoWindow({
      content: '<div style="color:#0f172a;font-size:13px;"><b>' + bsfEscapeHtml(dev.id) + '</b><br>' + bsfEscapeHtml(dev.client || 'Unassigned') + '<br>' + bsfEscapeHtml(String(dev.status || 'offline').toUpperCase()) + (mapsUrl ? '<br><a href="' + bsfEscapeHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer">Open Google Maps</a>' : '') + '</div>'
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
  renderLocationFilterResults(document.getElementById('page-content'));
}

function filterLocationDevices(devices, filters){
  const searchText = String(filters && filters.search || '').trim().toLowerCase();
  return (Array.isArray(devices) ? devices : []).filter(function(device){
    const client = device.client || 'Unassigned';
    const status = locationStatusValue(device.status);
    if(filters && filters.client && client !== filters.client) return false;
    if(filters && filters.status && status !== filters.status) return false;
    if(searchText){
      const id = String(device.id || '').toLowerCase();
      const name = String(device.name || '').toLowerCase();
      if(id.indexOf(searchText) < 0 && name.indexOf(searchText) < 0) return false;
    }
    return true;
  });
}

function locationResultsMarkup(filteredDevices){
  const positioned = filteredDevices.map(function(device){
    const profile = locationProfile(device);
    return { device:device, profile:profile };
  }).filter(function(item){ return locationValidCoordinate(item.profile.lat, item.profile.lng); });
  const latitudes = positioned.map(function(item){ return item.profile.lat; });
  const longitudes = positioned.map(function(item){ return item.profile.lng; });
  const minLat = latitudes.length ? Math.min.apply(null, latitudes) : 0;
  const maxLat = latitudes.length ? Math.max.apply(null, latitudes) : 0;
  const minLng = longitudes.length ? Math.min.apply(null, longitudes) : 0;
  const maxLng = longitudes.length ? Math.max.apply(null, longitudes) : 0;
  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;
  const markerHtml = positioned.map(function(item){
    const dev = item.device;
    const top = positioned.length === 1 ? 50 : 12 + ((maxLat - item.profile.lat) / latRange) * 76;
    const left = positioned.length === 1 ? 50 : 12 + ((item.profile.lng - minLng) / lngRange) * 76;
    const color = locationStatusColor(dev.status);
    const mapsUrl = locationMapsUrl(dev);
    const dot = '<span class="locations-static-marker" style="position:relative;width:18px;height:18px;display:block;background:' + color + ';border-radius:50%;box-shadow:0 0 0 6px ' + color + '33;border:3px solid #1e293b;"></span>';
    const title = bsfEscapeHtml(dev.id + ' - ' + locationStatusValue(dev.status).toUpperCase());
    return mapsUrl
      ? '<a class="locations-static-marker" href="' + bsfEscapeHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Open ' + bsfEscapeHtml(dev.id) + ' in Google Maps" title="' + title + '" style="position:absolute;top:' + top.toFixed(2) + '%;left:' + left.toFixed(2) + '%;transform:translate(-50%,-50%);text-decoration:none;">' + dot + '</a>'
      : '<span class="locations-static-marker" title="' + title + '" style="position:absolute;top:' + top.toFixed(2) + '%;left:' + left.toFixed(2) + '%;transform:translate(-50%,-50%);">' + dot + '</span>';
  }).join('');
  let mapNotice = '';
  if(!filteredDevices.length){
    mapNotice = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;"><div style="font-size:40px;margin-bottom:8px;">📍</div><p style="margin:0;font-size:13px;">No devices match the selected filters</p></div>';
  } else if(!positioned.length){
    mapNotice = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;"><div style="font-size:40px;margin-bottom:8px;">📍</div><p style="margin:0;font-size:13px;">GPS coordinates are not provided by device data</p></div>';
  }
  const cards = filteredDevices.length ? filteredDevices.map(function(device){
    const profile = locationProfile(device);
    const status = locationStatusValue(device.status);
    const color = locationStatusColor(status);
    const coordinates = profile.lat === null ? '—' : profile.lat + ', ' + profile.lng;
    const mapsLink = profile.mapsUrl
      ? '<a href="' + bsfEscapeHtml(profile.mapsUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;color:#10b981;font-size:12px;font-weight:600;text-decoration:none;">Open Google Maps</a>'
      : '<p style="margin:8px 0 0;color:#64748b;font-size:12px;">Google Maps unavailable</p>';
    return '<div style="background:#1e293b;border-radius:12px;padding:16px;border:1px solid #334155;">' +
      '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:12px;"><div><p style="margin:0;font-weight:700;color:#f8fafc;font-size:15px;">' + bsfEscapeHtml(device.id) + '</p><p style="margin:4px 0 0;font-size:12px;color:#64748b;">' + bsfEscapeHtml(device.name) + '</p></div>' +
      '<span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:' + color + '26;color:' + color + ';">' + bsfEscapeHtml(status.toUpperCase()) + '</span></div>' +
      '<p style="margin:0 0 4px;font-size:13px;color:#94a3b8;"><span style="color:#64748b;">Current Client:</span> ' + bsfEscapeHtml(device.client || 'Unassigned') + '</p>' +
      '<p style="margin:0 0 4px;font-size:13px;color:#94a3b8;"><span style="color:#64748b;">Location Preview:</span> ' + bsfEscapeHtml(coordinates) + '</p>' +
      (profile.address ? '<p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">' + bsfEscapeHtml(profile.address) + '</p>' : '') +
      mapsLink +
      '<p style="margin:10px 0 0;font-size:11px;color:#475569;">Powered by: ' + bsfEscapeHtml(profile.poweredBy) + '</p>' +
      '<p style="margin:8px 0 0;font-size:12px;color:#64748b;">Last update: ' + bsfEscapeHtml(device.lastUpdate || '—') + '</p></div>';
  }).join('') : '<div style="grid-column:1/-1;background:#1e293b;border-radius:12px;padding:32px;text-align:center;color:#64748b;border:1px solid #334155;">No devices match the selected filters</div>';

  return '<div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:20px;">' +
      '<div id="locations-map-canvas" style="background:#0f172a;border-radius:8px;height:480px;position:relative;overflow:hidden;border:1px solid #334155;">' +
        '<div id="locations-map-static-bg" style="position:absolute;width:100%;height:100%;background:linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%);"></div>' +
        markerHtml + mapNotice +
        '<div style="position:absolute;bottom:20px;left:20px;background:rgba(30,41,59,0.95);padding:12px 16px;border-radius:8px;border:1px solid #334155;">' +
          '<p style="margin:0 0 8px;font-size:12px;color:#94a3b8;font-weight:600;">Legend</p>' +
          '<div style="display:flex;flex-direction:column;gap:6px;">' +
            '<span style="font-size:12px;color:#e2e8f0;"><span style="width:10px;height:10px;background:#3b82f6;border-radius:50%;display:inline-block;margin-right:8px;"></span>Running</span>' +
            '<span style="font-size:12px;color:#e2e8f0;"><span style="width:10px;height:10px;background:#f59e0b;border-radius:50%;display:inline-block;margin-right:8px;"></span>Standby</span>' +
            '<span style="font-size:12px;color:#e2e8f0;"><span style="width:10px;height:10px;background:#ef4444;border-radius:50%;display:inline-block;margin-right:8px;"></span>Offline</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' + cards + '</div>';
}

function renderLocationFilterResults(container){
  if(!container) return;
  const filteredDevices = filterLocationDevices(scopedDevices(), locationFilters);
  const results = document.getElementById('locations-results');
  if(!results){
    renderLocations(container);
    return;
  }
  results.innerHTML = locationResultsMarkup(filteredDevices);
  initGoogleMapLocations(filteredDevices);
}

function renderLocations(container){
  const locationDevices = scopedDevices();
  const clientScoped = isClientScopedRole();
  const clientNames = scopedClientNames();
  const filteredDevices = filterLocationDevices(locationDevices, locationFilters);
  const clientFilterMarkup = clientScoped
    ? clientScopeBadge()
    : '<select id="location-client-filter" onchange="setLocationFilter(\'client\',this.value)" style="padding:10px 16px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option value=""' + (locationFilters.client ? '' : ' selected') + '>All Clients</option>' + clientNames.map(function(client){
        return '<option value="' + bsfEscapeHtml(client) + '"' + (locationFilters.client === client ? ' selected' : '') + '>' + bsfEscapeHtml(client) + '</option>';
      }).join('') + '</select>';
  const statusOptions = ['', 'running', 'standby', 'offline'].map(function(value){
    const label = value ? value.charAt(0).toUpperCase() + value.slice(1) : 'All';
    return '<option value="' + value + '"' + (locationFilters.status === value ? ' selected' : '') + '>' + label + '</option>';
  }).join('');

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
      <div id="locations-results">${locationResultsMarkup(filteredDevices)}</div>
    </div>
  `;
  initGoogleMapLocations(filteredDevices);
}
