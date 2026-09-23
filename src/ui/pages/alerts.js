function renderAlerts(container){
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Alert Management</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Monitor and manage sensor thresholds and device notifications</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:flex-end;">
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Client Filter
        <select id="alert-client-filter" onchange="alertFilters.client=this.value;alertFilters.machine='';renderAlerts(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:220px;"></select>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Machine Filter
        <select id="alert-machine-filter" onchange="alertFilters.machine=this.value;renderAlerts(document.getElementById('page-content'));" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:220px;"></select>
      </label>
      <button onclick="openThresholdModal()" style="padding:10px 20px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-weight:600;font-size:14px;cursor:pointer;">Edit the threshold of each machine</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Default Thresholds</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">CO₂</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">Indoor Air Quality</p></div>
            <div style="text-align:right;"><span style="color:#f59e0b;font-weight:700;font-size:16px;">900 ppm</span><p style="margin:2px 0 0;font-size:11px;color:#64748b;">Email to Admin</p></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">NO₂</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">Exhaust Gas</p></div>
            <div style="text-align:right;"><span style="color:#f59e0b;font-weight:700;font-size:16px;">0.18 ppm</span><p style="margin:2px 0 0;font-size:11px;color:#64748b;">Email to Admin</p></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0f172a;border-radius:8px;">
            <div><span style="color:#e2e8f0;font-weight:600;font-size:14px;">H₂S</span><p style="margin:2px 0 0;font-size:12px;color:#64748b;">Exhaust Gas</p></div>
            <div style="text-align:right;"><span style="color:#f59e0b;font-weight:700;font-size:16px;">0.25 ppm</span><p style="margin:2px 0 0;font-size:11px;color:#64748b;">Email to Admin</p></div>
          </div>
        </div>
        ${currentRole==='admin'?'<button style="width:100%;margin-top:12px;padding:10px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-weight:600;font-size:13px;cursor:pointer;">Edit Thresholds</button>':''}
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Alert History</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${filteredAlerts().map(a=>`
            <div style="padding:12px;background:#0f172a;border-radius:8px;border-left:3px solid ${a.level==='Critical'?'#ef4444':a.level==='Warning'?'#f59e0b':'#3b82f6'};">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
                <span style="font-weight:600;color:#f8fafc;font-size:13px;">${a.type}</span>
                <span style="padding:3px 8px;border-radius:12px;font-size:10px;font-weight:600;background:${a.status==='Pending'?'rgba(239,68,68,0.15)':a.status==='Acknowledged'?'rgba(245,158,11,0.15)':'rgba(16,185,129,0.15)'};color:${a.status==='Pending'?'#ef4444':a.status==='Acknowledged'?'#f59e0b':'#10b981'};">${a.status}</span>
              </div>
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">${a.device} · ${a.location} · ${a.time}</p>
              <p style="margin:0;font-size:12px;color:#64748b;">Value: <span style="color:#e2e8f0;font-weight:600;">${a.value}</span> · Threshold: ${a.threshold}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  populateAlertFilters();
  runTemperatureAlertCheck();
}

function getMachineThreshold(deviceId){
  return machineThresholds[deviceId] || {low:12, high:58};
}

function temperatureAlertFor(dev){
  const temp = Number(dev.containerTemp);
  if(!Number.isFinite(temp) || temp <= 0) return null;
  const threshold = getMachineThreshold(dev.id);
  if(temp > threshold.high){
    return {id:'T-'+dev.id+'-HIGH', time:'Now', device:dev.id, type:'Temperature High', value:temp.toFixed(1)+' °C', threshold:threshold.high+' °C', level:'Critical', status:'Pending', location:dev.client, notification:'Email'};
  }
  if(temp < threshold.low){
    return {id:'T-'+dev.id+'-LOW', time:'Now', device:dev.id, type:'Temperature Low', value:temp.toFixed(1)+' °C', threshold:threshold.low+' °C', level:'Critical', status:'Pending', location:dev.client, notification:'Email'};
  }
  return null;
}

function getTemperatureAlerts(){
  return devices.map(temperatureAlertFor).filter(Boolean);
}

function alertDeviceMatches(alert){
  if(alertFilters.machine && alert.device !== alertFilters.machine) return false;
  const dev = devices.find(function(item){ return item.id === alert.device; });
  if(alertFilters.client && (!dev || dev.client !== alertFilters.client)) return false;
  return true;
}

function filteredAlerts(){
  return getTemperatureAlerts().concat(alerts).filter(alertDeviceMatches);
}

function populateAlertFilters(){
  const clientSelect = document.getElementById('alert-client-filter');
  const machineSelect = document.getElementById('alert-machine-filter');
  const clients = [...new Set(devices.map(function(dev){ return dev.client; }))];
  if(clientSelect){
    clientSelect.innerHTML = '<option value="">All Clients</option>' + clients.map(function(client){ return '<option value="'+client+'"'+(alertFilters.client===client?' selected':'')+'>'+client+'</option>'; }).join('');
  }
  const list = alertFilters.client ? devices.filter(function(dev){ return dev.client===alertFilters.client; }) : devices;
  if(machineSelect){
    machineSelect.innerHTML = '<option value="">All Machines</option>' + list.map(function(dev){ return '<option value="'+dev.id+'"'+(alertFilters.machine===dev.id?' selected':'')+'>'+dev.id+'</option>'; }).join('');
  }
}

async function sendTemperatureNotification(alert){
  const key = alert.id;
  if(alertNotifications.indexOf(key) >= 0) return;
  alertNotifications.push(key);
  const payload = {device:alert.device, type:alert.type, value:alert.value, threshold:alert.threshold, email:'admin@platform.hk', channels:['email']};
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try { await window.BSF_API.sendAlertNotification(payload); }
    catch(error) { console.warn('Temperature notification failed:', error.message); }
  }
}

function runTemperatureAlertCheck(){
  getTemperatureAlerts().forEach(function(alert){ sendTemperatureNotification(alert); });
}

function getAlertFilteredDevices(){
  let list = alertFilters.client ? devices.filter(function(dev){ return dev.client===alertFilters.client; }) : devices;
  if(alertFilters.machine) list = list.filter(function(dev){ return dev.id===alertFilters.machine; });
  return list.length ? list : devices;
}

function openThresholdModal(){
  const list = getAlertFilteredDevices();
  const selectedId = alertFilters.machine || (list[0] ? list[0].id : '');
  const selectedThreshold = getMachineThreshold(selectedId);
  const options = list.map(function(dev){ return '<option value="' + clientEscape(dev.id) + '"' + (dev.id===selectedId?' selected':'') + '>' + clientEscape(dev.id) + ' · ' + clientEscape(dev.client) + '</option>'; }).join('');
  const locked = alertFilters.machine ? ' disabled' : '';
  let modal = document.getElementById('threshold-modal');
  if(!modal){ modal=document.createElement('div'); modal.id='threshold-modal'; document.body.appendChild(modal); }
  modal.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;"><div style="width:min(460px,100%);background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);"><h3 style="margin:0 0 18px;color:#f8fafc;font-size:18px;">Edit Machine Threshold</h3><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Machine</label><select id="threshold-machine-input" onchange="loadThresholdValues()"' + locked + ' style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;">' + options + '</select><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Low Temperature (°C)</label><input id="threshold-low-input" type="number" value="' + selectedThreshold.low + '" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;" /><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">High Temperature (°C)</label><input id="threshold-high-input" type="number" value="' + selectedThreshold.high + '" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button onclick="closeThresholdModal()" style="padding:9px 18px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-size:13px;cursor:pointer;">Cancel</button><button onclick="saveThresholdModal()" style="padding:9px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save</button></div></div></div>';
}

function loadThresholdValues(){
  const machine = (document.getElementById('threshold-machine-input') || {}).value || '';
  const threshold = getMachineThreshold(machine);
  const low = document.getElementById('threshold-low-input');
  const high = document.getElementById('threshold-high-input');
  if(low) low.value = threshold.low;
  if(high) high.value = threshold.high;
}
function closeThresholdModal(){
  const modal=document.getElementById('threshold-modal');
  if(modal) modal.remove();
}

function saveThresholdModal(){
  const machine=(document.getElementById('threshold-machine-input')||{}).value || '';
  const low=Number((document.getElementById('threshold-low-input')||{}).value);
  const high=Number((document.getElementById('threshold-high-input')||{}).value);
  if(!machine || !Number.isFinite(low) || !Number.isFinite(high) || low >= high){ alert('Please enter valid low/high thresholds'); return; }
  machineThresholds[machine] = {low:low, high:high};
  closeThresholdModal();
  renderAlerts(document.getElementById('page-content'));
}
