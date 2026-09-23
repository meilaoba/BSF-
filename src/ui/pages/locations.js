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

async function initGoogleMapLocations(){
  const canvas = document.getElementById('locations-map-canvas');
  if(!canvas) return;

  const maps = await loadGoogleMapsApi();
  if(!maps) return;

  const bg = document.getElementById('locations-map-static-bg');
  if(bg) bg.remove();
  document.querySelectorAll('.locations-static-marker').forEach(el=>el.remove());

  const center = devices.length
    ? {lat:devices[0].lat, lng:devices[0].lng}
    : {lat:22.3193, lng:114.1694};

  locationsMap = new window.google.maps.Map(canvas, {
    center,
    zoom: 12,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });

  const colorOf = status => status==='online' ? '#10b981' : status==='running' ? '#3b82f6' : status==='standby' ? '#f59e0b' : '#ef4444';
  devices.forEach(dev=>{
    const marker = new window.google.maps.Marker({
      position:{lat:dev.lat,lng:dev.lng},
      map: locationsMap,
      title: dev.id + ' - ' + dev.status.toUpperCase(),
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
      content: '<div style="color:#0f172a;font-size:13px;"><b>' + dev.id + '</b><br>' + dev.client + '<br>' + dev.status.toUpperCase() + '</div>'
    });
    marker.addListener('click', ()=>info.open({anchor:marker, map:locationsMap}));
  });
}

function renderLocations(container){
  const clientOptions = [...new Set(devices.map(function(dev){ return dev.client; }))].map(function(client){ return '<option>'+client+'</option>'; }).join('');
  const positioned = devices.filter(function(dev){ return Number.isFinite(dev.lat) && Number.isFinite(dev.lng); });
  const markerHtml = positioned.map(function(dev, i){
    const top = 25 + (i % 4) * 15;
    const left = 30 + (i % 5) * 12;
    const color = dev.status==='online' ? '#10b981' : dev.status==='running' ? '#3b82f6' : dev.status==='standby' ? '#f59e0b' : '#ef4444';
    return '<div class="locations-static-marker" style="position:absolute;top:'+top+'%;left:'+left+'%;width:18px;height:18px;background:'+color+';border-radius:50%;box-shadow:0 0 0 6px rgba(16,185,129,0.2);border:3px solid #1e293b;cursor:pointer;" title="'+dev.id+' - '+dev.status.toUpperCase()+'"></div>';
  }).join('');
  const mapNotice = positioned.length ? '' : '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;"><div style="font-size:40px;margin-bottom:8px;">📍</div><p style="margin:0;font-size:13px;">GPS coordinates are not provided by device data</p></div>';
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Device Locations</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">GPS tracking and geographic distribution of all units</p>
    </div>
    <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:20px;">
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <select style="padding:10px 16px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option>All Clients</option>${clientOptions}</select>
        <select style="padding:10px 16px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option>All Status</option><option>Online</option><option>Offline</option><option>Running</option><option>Standby</option></select>
        <input type="text" placeholder="Search device..." style="padding:10px 16px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:200px;" />
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
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
      ${devices.map(dev=>`
        <div style="background:#1e293b;border-radius:12px;padding:16px;border:1px solid #334155;">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;">
            <div>
              <p style="margin:0;font-weight:700;color:#f8fafc;font-size:15px;">${dev.id}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${dev.name}</p>
            </div>
            <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${dev.status==='online'?'rgba(16,185,129,0.15)':dev.status==='running'?'rgba(59,130,246,0.15)':dev.status==='standby'?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)'};color:${dev.status==='online'?'#10b981':dev.status==='running'?'#3b82f6':dev.status==='standby'?'#f59e0b':'#ef4444'};">${dev.status.toUpperCase()}</span>
          </div>
          <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;"><span style="color:#64748b;">Lat:</span> ${dev.lat === null || dev.lat === undefined ? '—' : dev.lat}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;"><span style="color:#64748b;">Lng:</span> ${dev.lng === null || dev.lng === undefined ? '—' : dev.lng}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;"><span style="color:#64748b;">Client:</span> ${dev.client}</p>
          <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Last update: ${dev.lastUpdate}</p>
        </div>
      `).join('')}
    </div>
  `;
  initGoogleMapLocations();
}
