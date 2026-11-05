function ghgMachineKey(device){
  return String(device.vendorDeviceId || device.backendId || device.id || '');
}

function ghgSelectedDevice(){
  const select = document.getElementById('ghg-machine-select');
  const key = select ? select.value : '';
  return devices.find(function(device){ return ghgMachineKey(device) === key; }) || null;
}

function ghgMachineOptions(){
  const seen = new Set();
  return devices.filter(function(device){
    const key = ghgMachineKey(device);
    if(!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(function(device){
    return '<option value="' + bsfEscapeHtml(ghgMachineKey(device)) + '">' + bsfEscapeHtml(device.id + ' - ' + (device.name || '')) + '</option>';
  }).join('');
}

function loadGhgConfigurationEditor(){
  const device = ghgSelectedDevice();
  const region = document.getElementById('ghg-region');
  const solar = document.getElementById('ghg-solar');
  const distance = document.getElementById('ghg-monthly-distance');
  const save = document.getElementById('ghg-save');
  if(region) region.value = device && device.region === 'hk' ? 'hk' : 'non-hk';
  if(solar) solar.value = device && device.ghgFormula && device.ghgFormula.solar ? 'true' : 'false';
  if(distance){
    const value = device && device.ghgFormula ? device.ghgFormula.monthlyDistanceKm : '';
    distance.value = value === null || value === undefined ? '' : String(value);
  }
  if(save) save.disabled = !device;
}

function renderSystem(container){
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">System Settings</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Configure platform globals, integrations and preferences</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">General Settings</h3>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Client Name</label><input type="text" value="IoT Tech Systems" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div>
          <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Timezone</label><select style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option>Asia/Hong_Kong (UTC+8)</option><option>UTC</option></select></div>
          <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Language</label><select style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option>English</option><option>中文</option></select></div>
        </div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Email & Notifications</h3>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">SMTP Server</label><input type="text" value="smtp.platform.hk" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div>
          <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Alert Email</label><input type="text" value="alerts@platform.hk" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div>
          <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Map Service</label><select style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option>Google Maps</option><option>OpenStreetMap</option></select></div>
        </div>
      </div>
    </div>

    <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-top:16px;">
      <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">GHG Configuration</h3>
      <p style="margin:0 0 16px;color:#64748b;font-size:12px;">Configure the selected machine. These values are stored in the BSF database and do not call the vendor API.</p>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Machine</label><select id="ghg-machine-select" onchange="loadGhgConfigurationEditor()" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">${ghgMachineOptions()}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Electricity Region</label><select id="ghg-region" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option value="hk">HK Island</option><option value="non-hk">Non-HK Island</option></select></div>
          <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Solar</label><select id="ghg-solar" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option value="false">No</option><option value="true">Yes</option></select></div>
        </div>
        <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Monthly Transport Distance (km)</label><input id="ghg-monthly-distance" type="number" min="0" step="0.1" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div>
        <button id="ghg-save" onclick="saveSystemSetting('ghg')" style="align-self:flex-start;padding:9px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Save GHG Configuration</button>
      </div>
    </div>
    <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-top:16px;">
      <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Weight Scaling</h3>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Starting From</label><select id="weight-scaling-mode" onchange="syncWeightScalingBase()" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option value="0">0 kg</option><option value="1">1 kg</option><option value="custom">Custom</option></select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;"><div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Base Value (kg)</label><input id="weight-scaling-base" type="number" value="0" step="0.1" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div><div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Display Precision</label><select id="weight-scaling-precision" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option value="1">1 decimal</option><option value="2" selected>2 decimals</option></select></div></div>
        <button onclick="saveSystemSetting('weight')" style="align-self:flex-start;padding:9px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Save Weight Scaling</button>
      </div>
    </div>
    <div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-top:16px;">
      <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Reset First Date</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">First Date</label><input id="reset-first-date" type="date" value="2026-01-01" onchange="syncResetCurrentPeriod()" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div>
        <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Current Period</label><input id="reset-current-period" type="text" value="2026-01-01 至今" readonly style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#94a3b8;font-size:14px;" /></div>
      </div>
      <button onclick="saveSystemSetting('reset')" style="margin-top:14px;padding:9px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Reset First Date</button>
    </div>
    <div style="margin-top:20px;">
      <button style="padding:12px 28px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Save Changes</button>
    </div>
  `;
  loadGhgConfigurationEditor();
}

async function saveSystemSetting(type){
  let payload = {type:type};
  let ghgDevice = null;
  if(type==='ghg') {
    ghgDevice = ghgSelectedDevice();
    if(!ghgDevice){
      alert('Select machine first');
      return;
    }
    const distanceText = (document.getElementById('ghg-monthly-distance') || {}).value || '';
    const distance = Number(distanceText);
    if(distanceText === '' || !Number.isFinite(distance) || distance < 0){
      alert('Monthly Transport Distance must be zero or greater');
      return;
    }
    payload = {
      machineId:ghgDevice.backendId || null,
      vendorDeviceId:ghgDevice.vendorDeviceId || null,
      region:(document.getElementById('ghg-region') || {}).value || 'non-hk',
      solar:(document.getElementById('ghg-solar') || {}).value === 'true',
      monthlyDistanceKm:distance
    };
  }
  if(type==='weight') payload = {type:type, mode:document.getElementById('weight-scaling-mode').value, base:Number(document.getElementById('weight-scaling-base').value), precision:Number(document.getElementById('weight-scaling-precision').value)};
  if(type==='reset') payload = {type:type, firstDate:document.getElementById('reset-first-date').value};
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try {
      if(type==='ghg') await window.BSF_API.saveGhgConfiguration(payload);
      else await window.BSF_API.saveSystemSettings(payload);
      if(type==='ghg' && ghgDevice){
        ghgDevice.region = payload.region;
        ghgDevice.ghgFormula = {
          ...(ghgDevice.ghgFormula || {}),
          solar:payload.solar,
          monthlyDistanceKm:payload.monthlyDistanceKm
        };
      }
      alert('Settings saved');
    }
    catch(error) { alert('Save failed: ' + error.message); }
  } else {
    alert('Settings saved locally. Backend API is not configured.');
  }
}

function syncWeightScalingBase(){
  const mode = (document.getElementById('weight-scaling-mode') || {}).value;
  const base = document.getElementById('weight-scaling-base');
  if(base && (mode === '0' || mode === '1')) base.value = mode;
}

function syncResetCurrentPeriod(){
  const first = document.getElementById('reset-first-date');
  const current = document.getElementById('reset-current-period');
  if(current) current.value = first && first.value ? first.value + ' 至今' : '';
}
