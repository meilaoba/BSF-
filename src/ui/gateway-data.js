
const CLIENT_RAW_HISTORY_KEY = 'bsf.delivery.clientRawDataHistory';
const CLIENT_RAW_HISTORY_LIMIT = 2000;

function clientRawHistoryKey(){
  return CLIENT_RAW_HISTORY_KEY + '.' + (currentRole || 'user');
}

function readClientRawHistory(){
  try {
    const rows = JSON.parse(localStorage.getItem(clientRawHistoryKey()) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch(error) {
    return [];
  }
}

function saveClientRawHistory(rows){
  const trimmed = rows.slice(0, CLIENT_RAW_HISTORY_LIMIT);
  try { localStorage.setItem(clientRawHistoryKey(), JSON.stringify(trimmed)); } catch(error) {}
}

function mergeClientRawHistory(history, incoming){
  const map = new Map();
  history.concat(incoming).forEach(function(row){
    if(!row || !row.device || !row.recordedAt) return;
    map.set(row.device + '@' + row.recordedAt, row);
  });
  return Array.from(map.values()).sort(function(a,b){
    return String(b.recordedAt).localeCompare(String(a.recordedAt));
  }).slice(0, CLIENT_RAW_HISTORY_LIMIT);
}

/* Gateway data bridge: maps bms_mos messages into legacy UI collections. */
function bsfFormatTime(sec){
  if(!sec) return '—';
  const d = new Date(sec * 1000);
  const p = function(n){ return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function bsfStatusFromDeviceState(state){
  const value = Number(state);
  if(value === 1) return 'running';
  if(value === 2) return 'standby';
  if(value === 3) return 'offline';
  return 'online';
}

function bsfWaitForGateway(){
  if(window.BSF_GATEWAY) return Promise.resolve(window.BSF_GATEWAY);
  return new Promise(function(resolve){
    window.addEventListener('bsf:api-ready', function(){ resolve(window.BSF_GATEWAY); }, {once:true});
  });
}

function bsfMessageList(payload){
  return payload && Array.isArray(payload.items) ? payload.items.slice() : [];
}

function bsfMapDevices(messages){
  const latest = new Map();
  messages.forEach(function(message){
    (message.devices || []).forEach(function(device){
      const current = latest.get(device.deviceId);
      if(!current || Number(message.timestamp) > Number(current.timestamp)) {
        latest.set(device.deviceId, {message:message, device:device});
      }
    });
  });
  return Array.from(latest.values()).map(function(entry){
    const data = entry.device.deviceData || {};
    return {
      id:entry.device.deviceId,
      name:entry.device.deviceId,
      client:'Unassigned',
      lat:null,
      lng:null,
      status:bsfStatusFromDeviceState(entry.device.deviceState),
      lastUpdate:bsfFormatTime(entry.message.receivedAt || entry.message.timestamp),
      network:'MQTT',
      signal:0,
      ghgReduced:'—',
      wasteCollected:'—',
      fertilizer:'—',
      dailyWaste:'—',
      dailyEnergy:'—',
      avgTemp:data.HotPlateTemp,
      containerTemp:data.CabinTemp,
      humidity:data.Humidity,
      realTimeWeight:data.RealTimeWeight,
      totalAddMaterial:data.TotalAddMaterial,
      totalDischarge:data.TotalDischarge,
      operatingStatus:data.OperatingStatus,
      fermentState:data.FermentState,
      fermentRunTime:data.FermentRunTime
    };
  });
}

function bsfMapRawRows(messages){
  return messages.map(function(message){
    const device = (message.devices || [])[0];
    if(!device) return null;
    const data = device.deviceData || {};
    return {
      recordedAt:bsfFormatTime(message.timestamp),
      device:device.deviceId,
      deviceState:bsfStatusFromDeviceState(device.deviceState).toUpperCase(),
      operatingStatus:data.OperatingStatus,
      fermentState:data.FermentState,
      feed:data.Feed,
      shredder:data.Shredder,
      mixingMotor:data.MixingMotor,
      fan:data.Fan,
      zipper:data.Zipper,
      weight:data.RealTimeWeight,
      temperature:data.CabinTemp,
      humidity:data.Humidity,
      energy:'—',
      solarPower:'—',
      co2:'—',
      no2:'—',
      h2s:'—',
      gps:'—',
      network:'MQTT',
      signal:0
    };
  }).filter(Boolean);
}

function bsfMapAlerts(devices){
  const out = [];
  devices.forEach(function(device){
    const temp = Number(device.containerTemp);
    if(!Number.isFinite(temp) || temp <= 0) return;
    if(temp > 58) out.push({id:'T-'+device.id+'-HIGH',time:device.lastUpdate,device:device.id,type:'Temperature High',value:temp.toFixed(1)+' °C',threshold:'58 °C',level:'Critical',status:'Pending',location:device.client});
    if(temp < 12) out.push({id:'T-'+device.id+'-LOW',time:device.lastUpdate,device:device.id,type:'Temperature Low',value:temp.toFixed(1)+' °C',threshold:'12 °C',level:'Critical',status:'Pending',location:device.client});
  });
  return out;
}

window.BSF_LOAD_GATEWAY_DATA = async function(limit){
  const gateway = await bsfWaitForGateway();
  if(!gateway) return false;
  try {
    const payload = await gateway.messages(limit || 100);
    const messages = bsfMessageList(payload);
    if(!messages.length) return false;
    const realDevices = bsfMapDevices(messages);
    devices.splice(0, devices.length, ...realDevices);
    const mappedRows = bsfMapRawRows(messages);
    if(currentRole === 'admin'){
      rawDataRows.splice(0, rawDataRows.length, ...mappedRows);
    } else {
      const history = mergeClientRawHistory(readClientRawHistory(), mappedRows);
      rawDataRows.splice(0, rawDataRows.length, ...history);
      saveClientRawHistory(history);
    }
    alerts.splice(0, alerts.length, ...bsfMapAlerts(realDevices));
    window.BSF_GATEWAY_LAST_LOAD = Date.now();
    return true;
  } catch(error) {
    console.warn('[BSF] gateway data load failed:', error.message);
    return false;
  }
};
