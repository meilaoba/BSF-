/* Authenticated API data bridge: maps backend and vendor records into UI collections. */
function bsfSafeIdentifier(value){
  return String(value === null || value === undefined ? '' : value)
    .replace(/[^a-zA-Z0-9_.:-]/g, '_')
    .slice(0, 160);
}

function bsfField(object, names){
  if(!object || typeof object !== 'object') return undefined;
  for(let i=0; i<names.length; i++){
    if(Object.prototype.hasOwnProperty.call(object, names[i]) && object[names[i]] !== undefined && object[names[i]] !== null && object[names[i]] !== '') return object[names[i]];
  }
  const wanted = names.map(function(name){ return String(name).toLowerCase(); });
  const keys = Object.keys(object);
  for(let i=0; i<keys.length; i++){
    if(wanted.indexOf(keys[i].toLowerCase()) >= 0 && object[keys[i]] !== undefined && object[keys[i]] !== null && object[keys[i]] !== '') return object[keys[i]];
  }
  return undefined;
}

function bsfNumber(value){
  if(value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function bsfDate(value){
  if(value === undefined || value === null || value === '') return null;
  if(value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if(typeof value === 'number' || /^\d+$/.test(String(value).trim())){
    const number = Number(value);
    const date = new Date(number < 100000000000 ? number * 1000 : number);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function bsfEpochSeconds(value){
  const date = bsfDate(value);
  return date ? Math.floor(date.getTime() / 1000) : 0;
}

function bsfFormatTime(value){
  const date = bsfDate(value);
  if(!date) return '\u2014';
  const p = function(n){ return String(n).padStart(2, '0'); };
  return date.getFullYear() + '-' + p(date.getMonth()+1) + '-' + p(date.getDate()) + ' ' + p(date.getHours()) + ':' + p(date.getMinutes()) + ':' + p(date.getSeconds());
}

function bsfDisplay(value){
  return value === undefined || value === null || value === '' ? '\u2014' : value;
}

function bsfList(value, key){
  if(Array.isArray(value)) return value;
  if(value && Array.isArray(value[key])) return value[key];
  if(value && Array.isArray(value.items)) return value.items;
  if(value && Array.isArray(value.list)) return value.list;
  return [];
}

function bsfStatusFromDeviceState(state){
  const value = Number(state);
  if(value === 1) return 'running';
  if(value === 2) return 'standby';
  if(value === 3) return 'offline';
  return 'online';
}

function bsfRawState(status){
  return String(status || 'offline').replace(/^./, function(letter){ return letter.toUpperCase(); });
}

function bsfStatusLabel(value){
  const number = bsfNumber(value);
  if(number === 1) return 'Running';
  if(number === 2) return 'Standby';
  if(number === 3) return 'Stopped';
  if(value === undefined || value === null || value === '') return '\u2014';
  return String(value);
}

function bsfReadTelemetry(data){
  return {
    cabinTempC: bsfNumber(bsfField(data, ['CabinTemp', 'cabinTemp', 'cabin_temp', 'cabin_temp_c', 'temperature'])),
    hotPlateTempC: bsfNumber(bsfField(data, ['HotPlateTemp', 'hotPlateTemp', 'hot_plate_temp', 'hot_plate_temp_c'])),
    humidityPct: bsfNumber(bsfField(data, ['Humidity', 'humidity', 'humidity_pct'])),
    realTimeWeightKg: bsfNumber(bsfField(data, ['RealTimeWeight', 'realTimeWeight', 'real_time_weight', 'real_time_weight_kg', 'weight'])),
    totalAddedMaterialKg: bsfNumber(bsfField(data, ['TotalAddMaterial', 'totalAddMaterial', 'total_added_material_kg'])),
    totalDischargeKg: bsfNumber(bsfField(data, ['TotalDischarge', 'totalDischarge', 'total_discharge_kg', 'OtalUnloadingWeight'])),
    runTimeMin: bsfNumber(bsfField(data, ['RunTime', 'runTime', 'run_time_min'])),
    operatingStatusCode: bsfNumber(bsfField(data, ['OperatingStatus', 'operatingStatus', 'operating_status_code'])),
    operatingStatus: bsfStatusLabel(bsfField(data, ['OperatingStatus', 'operatingStatus', 'operating_status'])),
    fermentStateCode: bsfNumber(bsfField(data, ['FermentState', 'fermentState', 'ferment_state_code'])),
    fermentState: bsfStatusLabel(bsfField(data, ['FermentState', 'fermentState', 'ferment_state'])),
    fermentRunTimeMin: bsfNumber(bsfField(data, ['FermentRunTime', 'fermentRunTime', 'ferment_run_time_min'])),
    feedCode: bsfNumber(bsfField(data, ['Feed', 'feed', 'feed_code'])),
    shredderCode: bsfNumber(bsfField(data, ['Shredder', 'shredder', 'shredder_code'])),
    mixingMotorCode: bsfNumber(bsfField(data, ['MixingMotor', 'mixingMotor', 'mixing_motor_code'])),
    fanCode: bsfNumber(bsfField(data, ['Fan', 'fan', 'fan_code'])),
    zipperCode: bsfNumber(bsfField(data, ['Zipper', 'zipper', 'zipper_code'])),
    energyKwh: bsfNumber(bsfField(data, ['Energy', 'energy', 'energy_kwh'])),
    solarPowerKw: bsfNumber(bsfField(data, ['SolarPower', 'solarPower', 'solar_power_kw'])),
    co2Ppm: bsfNumber(bsfField(data, ['CO2', 'co2', 'co2_ppm'])),
    no2Ppm: bsfNumber(bsfField(data, ['NO2', 'no2', 'no2_ppm'])),
    h2sPpm: bsfNumber(bsfField(data, ['H2S', 'h2s', 'h2s_ppm'])),
    signalPct: bsfNumber(bsfField(data, ['Signal', 'signal', 'signal_pct']))
  };
}

function bsfHasTelemetry(reading){
  return Object.keys(reading).some(function(key){ return reading[key] !== null && reading[key] !== '\u2014'; });
}

function bsfMachineDisplayId(machine, vendor){
  return bsfSafeIdentifier(
    bsfField(machine, ['device_id', 'serial', 'id']) ||
    bsfField(vendor, ['serialNumber', 'id'])
  );
}

function bsfResolveStatus(machine, vendor, reading, stored){
  const machineStatus = String(bsfField(machine, ['status']) || '').toLowerCase();
  if(machineStatus === 'inactive' || machineStatus === 'retired') return 'offline';
  if(machineStatus === 'maintenance') return 'standby';
  const onlineCode = bsfNumber(bsfField(vendor, ['onlineCode', 'deviceOnline']));
  if(onlineCode === 0) return 'offline';
  const deviceState = bsfField(stored, ['device_state', 'deviceState']);
  if(deviceState !== undefined) return bsfStatusFromDeviceState(deviceState);
  if(reading.operatingStatusCode !== null) return bsfStatusFromDeviceState(reading.operatingStatusCode);
  return onlineCode === 1 ? 'online' : 'online';
}

function bsfLastUpdate(machine, vendor, stored, reading){
  const telemetry = bsfField(vendor, ['telemetry', 'data']) || {};
  return bsfFormatTime(
    bsfField(telemetry, ['timestamp', 'recordedAt', 'recorded_at', 'updateTime', 'dataTime']) ||
    bsfField(stored, ['recorded_at', 'recordedAt']) ||
    bsfField(machine, ['last_seen_at']) ||
    bsfField(vendor, ['last_synced_at', 'lastSyncedAt'])
  );
}

function bsfDeviceFromMachine(machine, vendor, stored){
  const vendorTelemetry = bsfField(vendor, ['telemetry', 'data']) || {};
  const reading = bsfHasTelemetry(bsfReadTelemetry(vendorTelemetry))
    ? bsfReadTelemetry(vendorTelemetry)
    : bsfReadTelemetry(stored || {});
  const id = bsfMachineDisplayId(machine, vendor);
  if(!id) return null;
  return {
    id:id,
    backendId:bsfField(machine, ['id']) || '',
    vendorDeviceId:bsfField(machine, ['vendor_device_id']) || bsfField(vendor, ['id']) || '',
    serial:bsfField(machine, ['serial']) || bsfField(vendor, ['serialNumber']) || id,
    name:bsfField(machine, ['name']) || bsfField(vendor, ['deviceName']) || bsfField(machine, ['serial']) || id,
    client:bsfField(machine, ['client_name']) || 'Unassigned',
    clientId:bsfField(machine, ['client_id']) || '',
    location:bsfField(machine, ['location']) || bsfField(vendor, ['addressCode']) || 'Unassigned',
    lat:bsfNumber(bsfField(machine, ['latitude'])) ?? bsfNumber(bsfField(vendor, ['latitude'])),
    lng:bsfNumber(bsfField(machine, ['longitude'])) ?? bsfNumber(bsfField(vendor, ['longitude'])),
    status:bsfResolveStatus(machine, vendor, reading, stored),
    lastUpdate:bsfLastUpdate(machine, vendor, stored, reading),
    network:'Vendor API',
    signal:reading.signalPct ?? 0,
    ghgReduced:'\u2014',
    wasteCollected:'\u2014',
    fertilizer:'\u2014',
    dailyWaste:'\u2014',
    dailyEnergy:'\u2014',
    avgTemp:bsfDisplay(reading.hotPlateTempC),
    containerTemp:bsfDisplay(reading.cabinTempC),
    humidity:bsfDisplay(reading.humidityPct),
    realTimeWeight:bsfDisplay(reading.realTimeWeightKg),
    totalAddMaterial:bsfDisplay(reading.totalAddedMaterialKg),
    totalDischarge:bsfDisplay(reading.totalDischargeKg),
    operatingStatus:reading.operatingStatus,
    fermentState:reading.fermentState,
    fermentRunTime:bsfDisplay(reading.fermentRunTimeMin)
  };
}

function bsfDeviceFromVendor(vendor){
  const telemetry = bsfField(vendor, ['telemetry', 'data']) || {};
  const reading = bsfReadTelemetry(telemetry);
  const id = bsfSafeIdentifier(bsfField(vendor, ['serialNumber', 'id']));
  if(!id) return null;
  return {
    id:id,
    backendId:'',
    vendorDeviceId:bsfField(vendor, ['id']) || '',
    serial:bsfField(vendor, ['serialNumber']) || id,
    name:bsfField(vendor, ['deviceName']) || id,
    client:'Unassigned',
    clientId:'',
    location:bsfField(vendor, ['addressCode']) || 'Unassigned',
    lat:bsfNumber(bsfField(vendor, ['latitude'])),
    lng:bsfNumber(bsfField(vendor, ['longitude'])),
    status:bsfResolveStatus(null, vendor, reading, null),
    lastUpdate:bsfLastUpdate(null, vendor, null, reading),
    network:'Vendor API',
    signal:reading.signalPct ?? 0,
    ghgReduced:'\u2014',
    wasteCollected:'\u2014',
    fertilizer:'\u2014',
    dailyWaste:'\u2014',
    dailyEnergy:'\u2014',
    avgTemp:bsfDisplay(reading.hotPlateTempC),
    containerTemp:bsfDisplay(reading.cabinTempC),
    humidity:bsfDisplay(reading.humidityPct),
    realTimeWeight:bsfDisplay(reading.realTimeWeightKg),
    totalAddMaterial:bsfDisplay(reading.totalAddedMaterialKg),
    totalDischarge:bsfDisplay(reading.totalDischargeKg),
    operatingStatus:reading.operatingStatus,
    fermentState:reading.fermentState,
    fermentRunTime:bsfDisplay(reading.fermentRunTimeMin)
  };
}

function bsfStoredRow(row, machineById){
  const machine = machineById.get(String(bsfField(row, ['machine_id']) || ''));
  const vendorId = bsfField(row, ['vendor_device_id']) || '';
  const device = machine ? bsfMachineDisplayId(machine, null) : bsfField(row, ['machine_serial', 'device_key', 'machine_id']);
  if(!device) return null;
  const reading = bsfReadTelemetry(row);
  const status = bsfStatusFromDeviceState(bsfField(row, ['device_state', 'deviceState']));
  const recordedAt = bsfField(row, ['recorded_at', 'recordedAt']);
  const receivedAt = bsfField(row, ['received_at', 'receivedAt']) || recordedAt;
  return {
    recordedAt:bsfFormatTime(recordedAt),
    receivedAtSeconds:bsfEpochSeconds(receivedAt),
    sourceTimestampSeconds:bsfEpochSeconds(recordedAt),
    device:bsfSafeIdentifier(device),
    deviceState:bsfRawState(status),
    operatingStatus:reading.operatingStatus,
    fermentState:reading.fermentState,
    feed:bsfDisplay(reading.feedCode),
    shredder:bsfDisplay(reading.shredderCode),
    mixingMotor:bsfDisplay(reading.mixingMotorCode),
    fan:bsfDisplay(reading.fanCode),
    zipper:bsfDisplay(reading.zipperCode),
    weight:bsfDisplay(reading.realTimeWeightKg),
    temperature:bsfDisplay(reading.cabinTempC),
    humidity:bsfDisplay(reading.humidityPct),
    energy:bsfDisplay(reading.energyKwh),
    solarPower:bsfDisplay(reading.solarPowerKw),
    co2:bsfDisplay(reading.co2Ppm),
    no2:bsfDisplay(reading.no2Ppm),
    h2s:bsfDisplay(reading.h2sPpm),
    gps:bsfNumber(bsfField(row, ['latitude'])) !== null && bsfNumber(bsfField(row, ['longitude'])) !== null
      ? bsfField(row, ['latitude']) + ',' + bsfField(row, ['longitude'])
      : '\u2014',
    network:'API',
    signal:reading.signalPct ?? 0,
    vendorDeviceId:vendorId,
    volatile:false
  };
}

function bsfVendorRow(vendor, machine){
  const telemetry = bsfField(vendor, ['telemetry', 'data']) || {};
  const reading = bsfReadTelemetry(telemetry);
  if(!bsfHasTelemetry(reading)) return null;
  const device = machine ? bsfMachineDisplayId(machine, vendor) : bsfSafeIdentifier(bsfField(vendor, ['serialNumber', 'id']));
  if(!device) return null;
  const recordedAt = bsfField(telemetry, ['timestamp', 'recordedAt', 'recorded_at', 'updateTime', 'dataTime']);
  return {
    recordedAt:bsfFormatTime(recordedAt || Date.now()),
    receivedAtSeconds:bsfEpochSeconds(Date.now()),
    sourceTimestampSeconds:bsfEpochSeconds(recordedAt),
    device:device,
    deviceState:bsfRawState(bsfResolveStatus(machine, vendor, reading, null)),
    operatingStatus:reading.operatingStatus,
    fermentState:reading.fermentState,
    feed:bsfDisplay(reading.feedCode),
    shredder:bsfDisplay(reading.shredderCode),
    mixingMotor:bsfDisplay(reading.mixingMotorCode),
    fan:bsfDisplay(reading.fanCode),
    zipper:bsfDisplay(reading.zipperCode),
    weight:bsfDisplay(reading.realTimeWeightKg),
    temperature:bsfDisplay(reading.cabinTempC),
    humidity:bsfDisplay(reading.humidityPct),
    energy:bsfDisplay(reading.energyKwh),
    solarPower:bsfDisplay(reading.solarPowerKw),
    co2:bsfDisplay(reading.co2Ppm),
    no2:bsfDisplay(reading.no2Ppm),
    h2s:bsfDisplay(reading.h2sPpm),
    gps:bsfNumber(bsfField(vendor, ['latitude'])) !== null && bsfNumber(bsfField(vendor, ['longitude'])) !== null
      ? bsfField(vendor, ['latitude']) + ',' + bsfField(vendor, ['longitude'])
      : '\u2014',
    network:'Vendor API',
    signal:reading.signalPct ?? 0,
    vendorDeviceId:bsfField(vendor, ['id']) || '',
    volatile:!recordedAt
  };
}

function bsfBuildSnapshot(machineRows, vendorRows, telemetryRows){
  const machines = machineRows.slice();
  const vendors = vendorRows.slice();
  const machineById = new Map();
  const machineByVendor = new Map();
  machines.forEach(function(machine){
    const id = bsfField(machine, ['id']);
    if(id) machineById.set(String(id), machine);
    const vendorId = bsfField(machine, ['vendor_device_id']);
    if(vendorId) machineByVendor.set(String(vendorId), machine);
  });

  const storedRows = telemetryRows.map(function(row){ return bsfStoredRow(row, machineById); }).filter(Boolean);
  const latestStored = new Map();
  storedRows.forEach(function(row){
    const current = latestStored.get(row.device);
    if(!current || row.sourceTimestampSeconds > current.sourceTimestampSeconds) latestStored.set(row.device, row);
  });

  const deviceMap = new Map();
  const linkedVendorIds = new Set();
  vendors.forEach(function(vendor){
    const vendorId = bsfField(vendor, ['id']);
    const machine = vendorId ? machineByVendor.get(String(vendorId)) : null;
    if(!machine) return;
    linkedVendorIds.add(String(vendorId));
    const device = bsfDeviceFromMachine(machine, vendor, latestStored.get(bsfMachineDisplayId(machine, vendor)));
    if(device) deviceMap.set(device.id, device);
  });

  machines.forEach(function(machine){
    const vendorId = bsfField(machine, ['vendor_device_id']);
    if(vendorId && linkedVendorIds.has(String(vendorId))) return;
    const vendor = vendorId ? vendors.find(function(item){ return String(bsfField(item, ['id']) || '') === String(vendorId); }) : null;
    const device = bsfDeviceFromMachine(machine, vendor, latestStored.get(bsfMachineDisplayId(machine, vendor)));
    if(device) deviceMap.set(device.id, device);
  });

  vendors.forEach(function(vendor){
    const vendorId = String(bsfField(vendor, ['id']) || '');
    if(vendorId && linkedVendorIds.has(vendorId)) return;
    const device = bsfDeviceFromVendor(vendor);
    if(device && !deviceMap.has(device.id)) deviceMap.set(device.id, device);
  });

  const vendorRowsForUi = vendors.map(function(vendor){
    const vendorId = String(bsfField(vendor, ['id']) || '');
    const machine = vendorId ? machineByVendor.get(vendorId) : null;
    return bsfVendorRow(vendor, machine);
  }).filter(Boolean);

  const rowMap = new Map();
  storedRows.forEach(function(row){ rowMap.set(row.device + '@' + (row.sourceTimestampSeconds || row.recordedAt), row); });
  vendorRowsForUi.forEach(function(row){ rowMap.set(row.device + '@' + (row.sourceTimestampSeconds || 'live'), row); });
  const rows = Array.from(rowMap.values()).sort(function(a, b){
    return (b.sourceTimestampSeconds || b.receivedAtSeconds || 0) - (a.sourceTimestampSeconds || a.receivedAtSeconds || 0);
  });

  return { devices:Array.from(deviceMap.values()), rows:rows };
}

function bsfWaitForBackendApi(){
  if(window.BSF_API) return Promise.resolve(window.BSF_API);
  return new Promise(function(resolve){
    const finish = function(){ resolve(window.BSF_API || null); };
    window.addEventListener('bsf:api-ready', finish, {once:true});
    setTimeout(finish, 5000);
  });
}

async function bsfFetchSnapshot(limit){
  const api = await bsfWaitForBackendApi();
  if(!api) throw new Error('Backend API is unavailable');
  const results = await Promise.allSettled([
    api.getMachines({ limit:1000 }),
    api.getVendorDevices({ pageNum:1, pageSize:100 }),
    api.getDeviceData({ limit:Math.max(1, Math.min(Number(limit) || 1000, 1000)) })
  ]);
  if(results.every(function(result){ return result.status === 'rejected'; })) throw results[0].reason;
  return bsfBuildSnapshot(
    results[0].status === 'fulfilled' ? bsfList(results[0].value, 'machines') : [],
    results[1].status === 'fulfilled' ? bsfList(results[1].value, 'devices') : [],
    results[2].status === 'fulfilled' ? bsfList(results[2].value, 'records') : []
  );
}

function bsfAlertsFromDevices(deviceList){
  const out = [];
  deviceList.forEach(function(device){
    const temp = Number(device.containerTemp);
    if(!Number.isFinite(temp) || temp <= 0) return;
    if(temp > 58) out.push({ id:'T-'+device.id+'-HIGH', time:device.lastUpdate, device:device.id, type:'Temperature High', value:temp.toFixed(1)+' \u00b0C', threshold:'58 \u00b0C', level:'Critical', status:'Pending', location:device.client });
    if(temp < 12) out.push({ id:'T-'+device.id+'-LOW', time:device.lastUpdate, device:device.id, type:'Temperature Low', value:temp.toFixed(1)+' \u00b0C', threshold:'12 \u00b0C', level:'Critical', status:'Pending', location:device.client });
  });
  return out;
}

function bsfSnapshotFingerprint(deviceList, rows){
  return JSON.stringify({
    devices:deviceList.map(function(device){ return [device.id, device.status, device.lastUpdate, device.containerTemp, device.realTimeWeight]; }),
    rows:rows.slice(0, 50).map(function(row){ return [row.device, row.recordedAt, row.temperature, row.weight, row.humidity]; })
  });
}

async function bsfLoadBackendData(limit){
  const snapshot = await bsfFetchSnapshot(limit);
  const fingerprint = bsfSnapshotFingerprint(snapshot.devices, snapshot.rows);
  const changed = window.BSF_BACKEND_LAST_FINGERPRINT !== fingerprint;
  window.BSF_BACKEND_LAST_FINGERPRINT = fingerprint;
  devices.splice(0, devices.length, ...snapshot.devices);
  rawDataRows.splice(0, rawDataRows.length, ...snapshot.rows);
  window.BSF_GRAPH_HISTORY_ROWS = snapshot.rows.slice();
  alerts.splice(0, alerts.length, ...bsfAlertsFromDevices(snapshot.devices));
  window.BSF_BACKEND_LAST_LOAD = Date.now();
  return { loaded:true, changed:changed };
}

window.BSF_LOAD_BACKEND_DATA = async function(limit){
  try {
    const result = await bsfLoadBackendData(limit);
    return result.loaded;
  } catch(error) {
    console.warn('[BSF] API data load failed:', error.message);
    return false;
  }
};

window.BSF_LOAD_BACKEND_LATEST = async function(){
  try {
    const result = await bsfLoadBackendData(1000);
    return result.changed;
  } catch(error) {
    console.warn('[BSF] API latest load failed:', error.message);
    return false;
  }
};

window.BSF_BACKEND_DATA = {
  formatTime:bsfFormatTime,
  readTelemetry:bsfReadTelemetry,
  buildSnapshot:bsfBuildSnapshot
};
