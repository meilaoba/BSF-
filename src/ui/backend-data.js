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

function bsfTelemetryObject(value){
  if(!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const clean = Object.create(null);
  Object.keys(value).slice(0, 256).forEach(function(rawKey){
    const key = String(rawKey).trim();
    if(!key || key.length > 128 || key === '__proto__' || key === 'prototype' || key === 'constructor') return;
    const raw = value[rawKey];
    if(raw !== null && !['string', 'number', 'boolean'].includes(typeof raw)) return;
    if(typeof raw === 'string' && raw.length > 500) return;
    clean[key] = raw;
  });
  return clean;
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
  if(value === 0) return 'offline';
  if(value === 1) return 'standby';
  if(value === 2) return 'running';
  return 'offline';
}

function bsfRawState(status){
  return String(status || 'offline').replace(/^./, function(letter){ return letter.toUpperCase(); });
}

function bsfOperatingStatusLabel(value){
  const number = bsfNumber(value);
  if(number === 0) return 'Power off';
  if(number === 1) return 'Standby';
  if(number === 2) return 'Running';
  if(value === undefined || value === null || value === '') return '\u2014';
  return String(value);
}

function bsfFermentStateLabel(value){
  const number = bsfNumber(value);
  if(number === 0) return 'Stopped';
  if(number === 1) return 'Running';
  if(value === undefined || value === null || value === '') return '\u2014';
  return String(value);
}

function bsfOperatingStateFromCode(value){
  const number = bsfNumber(value);
  if(number === 0) return 'offline';
  if(number === 1) return 'standby';
  if(number === 2) return 'running';
  return null;
}

function bsfTelemetryKilograms(data, rawNames, kgNames){
  const kgValue = bsfField(data, kgNames);
  if(kgValue !== undefined && kgValue !== null && kgValue !== '') return bsfNumber(kgValue);
  const tonnes = bsfNumber(bsfField(data, rawNames));
  return tonnes === null ? null : tonnes * 1000;
}

function bsfHumidityPercent(value){
  const number = bsfNumber(value);
  if(number === null) return null;
  const configured = window.BSF_RUNTIME_CONFIG && Number(window.BSF_RUNTIME_CONFIG.humidityScale);
  const scale = Number.isFinite(configured) && configured > 0 ? configured : 1;
  return number * scale;
}

function bsfReadTelemetry(data){
  return {
    cabinTempC: bsfNumber(bsfField(data, ['CabinTemp', 'cabinTemp', 'cabin_temp', 'cabin_temp_c', 'temperature'])),
    hotPlateTempC: bsfNumber(bsfField(data, ['HotPlateTemp', 'hotPlateTemp', 'hot_plate_temp', 'hot_plate_temp_c'])),
    humidityPct: bsfHumidityPercent(bsfField(data, ['Humidity', 'humidity', 'humidity_pct'])),
    realTimeWeightKg: bsfNumber(bsfField(data, ['RealTimeWeight', 'realTimeWeight', 'real_time_weight', 'real_time_weight_kg', 'weight'])),
    totalAddedMaterialKg: bsfTelemetryKilograms(data, ['TotalAddMaterial', 'totalAddMaterial'], ['total_added_material_kg']),
    singleAddedMaterialKg: bsfNumber(bsfField(data, ['SingleAddMaterial', 'singleAddMaterial', 'single_added_material_kg'])),
    totalDischargeKg: bsfTelemetryKilograms(data, ['TotalDischarge', 'totalDischarge', 'OtalUnloadingWeight'], ['total_discharge_kg']),
    singleDischargeKg: bsfNumber(bsfField(data, ['SingleDischarge', 'singleDischarge', 'single_discharge_kg'])),
    dischargeCode: bsfNumber(bsfField(data, ['Discharge', 'discharge', 'discharge_code'])),
    runTimeMin: bsfNumber(bsfField(data, ['RunTime', 'runTime', 'run_time_min'])),
    operatingStatusCode: bsfNumber(bsfField(data, ['OperatingStatus', 'operatingStatus', 'operating_status_code'])),
    operatingStatus: bsfOperatingStatusLabel(bsfField(data, ['OperatingStatus', 'operatingStatus', 'operating_status'])),
    fermentStateCode: bsfNumber(bsfField(data, ['FermentState', 'fermentState', 'ferment_state_code'])),
    fermentState: bsfFermentStateLabel(bsfField(data, ['FermentState', 'fermentState', 'ferment_state'])),
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
  if(onlineCode === 1) return 'standby';
  if(onlineCode === 2) return 'running';
  const deviceState = bsfField(stored, ['device_state', 'deviceState']);
  if(deviceState !== undefined) return bsfStatusFromDeviceState(deviceState);
  if(reading.operatingStatusCode !== null) return bsfOperatingStateFromCode(reading.operatingStatusCode) || 'offline';
  return 'offline';
}

function bsfLastUpdate(machine, vendor, stored, reading){
  const telemetry = bsfField(vendor, ['telemetry', 'data']) || {};
  return bsfFormatTime(
    bsfField(telemetry, ['timestamp', 'recordedAt', 'recorded_at', 'updateTime', 'dataTime']) ||
    bsfField(stored, ['recorded_at', 'recordedAt']) ||
    bsfField(machine, ['last_seen_at']) ||
    bsfField(vendor, ['recordedAt', 'recorded_at', 'latestTelemetryAt']) ||
    bsfField(vendor, ['last_synced_at', 'lastSyncedAt'])
  );
}

function bsfDeviceFromMachine(machine, vendor, stored){
  const vendorTelemetry = bsfField(vendor, ['telemetry', 'data']) || {};
  const rawTelemetry = bsfTelemetryObject(vendorTelemetry);
  const liveTelemetry = Object.keys(rawTelemetry).length ? rawTelemetry : bsfTelemetryObject(stored || {});
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
    signal:reading.signalPct,
    vendorDeviceType:bsfField(vendor, ['deviceType']) ?? '',
    vendorTemplateName:bsfField(vendor, ['templateName']) || '',
    vendorAddressCode:bsfField(vendor, ['addressCode']) || '',
    vendorOwnerName:bsfField(bsfField(vendor, ['owner']) || {}, ['userName']) || '',
    vendorPower:bsfNumber(bsfField(vendor, ['power'])),
    vendorCreatedAt:bsfField(vendor, ['createdAt', 'createTime']) || '',
    vendorLastSyncedAt:bsfField(vendor, ['lastSyncedAt', 'last_synced_at']) || '',
    vendorRealtime:bsfField(vendor, ['realtime']) === true,
    ghgReduced:'\u2014',
    wasteCollected:'\u2014',
    fertilizer:'\u2014',
    dailyWaste:'\u2014',
    dailyEnergy:'\u2014',
    avgTemp:bsfDisplay(reading.hotPlateTempC),
    hotPlateTemp:bsfDisplay(reading.hotPlateTempC),
    containerTemp:bsfDisplay(reading.cabinTempC),
    humidity:bsfDisplay(reading.humidityPct),
    realTimeWeight:bsfDisplay(reading.realTimeWeightKg),
    totalAddMaterial:bsfDisplay(reading.totalAddedMaterialKg),
    singleAddMaterial:bsfDisplay(reading.singleAddedMaterialKg),
    totalDischarge:bsfDisplay(reading.totalDischargeKg),
    singleDischarge:bsfDisplay(reading.singleDischargeKg),
    discharge:bsfDisplay(reading.dischargeCode),
    runTime:bsfDisplay(reading.runTimeMin),
    feed:bsfDisplay(reading.feedCode),
    shredder:bsfDisplay(reading.shredderCode),
    mixingMotor:bsfDisplay(reading.mixingMotorCode),
    fan:bsfDisplay(reading.fanCode),
    zipper:bsfDisplay(reading.zipperCode),
    operatingStatus:reading.operatingStatus,
    fermentState:reading.fermentState,
    fermentRunTime:bsfDisplay(reading.fermentRunTimeMin),
    telemetry:liveTelemetry,
    telemetrySource:Object.keys(rawTelemetry).length ? 'Vendor API' : 'Stored telemetry'
  };
}

function bsfDeviceFromVendor(vendor){
  const telemetry = bsfField(vendor, ['telemetry', 'data']) || {};
  const rawTelemetry = bsfTelemetryObject(telemetry);
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
    signal:reading.signalPct,
    vendorDeviceType:bsfField(vendor, ['deviceType']) ?? '',
    vendorTemplateName:bsfField(vendor, ['templateName']) || '',
    vendorAddressCode:bsfField(vendor, ['addressCode']) || '',
    vendorOwnerName:bsfField(bsfField(vendor, ['owner']) || {}, ['userName']) || '',
    vendorPower:bsfNumber(bsfField(vendor, ['power'])),
    vendorCreatedAt:bsfField(vendor, ['createdAt', 'createTime']) || '',
    vendorLastSyncedAt:bsfField(vendor, ['lastSyncedAt', 'last_synced_at']) || '',
    vendorRealtime:bsfField(vendor, ['realtime']) === true,
    ghgReduced:'\u2014',
    wasteCollected:'\u2014',
    fertilizer:'\u2014',
    dailyWaste:'\u2014',
    dailyEnergy:'\u2014',
    avgTemp:bsfDisplay(reading.hotPlateTempC),
    hotPlateTemp:bsfDisplay(reading.hotPlateTempC),
    containerTemp:bsfDisplay(reading.cabinTempC),
    humidity:bsfDisplay(reading.humidityPct),
    realTimeWeight:bsfDisplay(reading.realTimeWeightKg),
    totalAddMaterial:bsfDisplay(reading.totalAddedMaterialKg),
    singleAddMaterial:bsfDisplay(reading.singleAddedMaterialKg),
    totalDischarge:bsfDisplay(reading.totalDischargeKg),
    singleDischarge:bsfDisplay(reading.singleDischargeKg),
    discharge:bsfDisplay(reading.dischargeCode),
    runTime:bsfDisplay(reading.runTimeMin),
    feed:bsfDisplay(reading.feedCode),
    shredder:bsfDisplay(reading.shredderCode),
    mixingMotor:bsfDisplay(reading.mixingMotorCode),
    fan:bsfDisplay(reading.fanCode),
    zipper:bsfDisplay(reading.zipperCode),
    operatingStatus:reading.operatingStatus,
    fermentState:reading.fermentState,
    fermentRunTime:bsfDisplay(reading.fermentRunTimeMin),
    telemetry:rawTelemetry,
    telemetrySource:Object.keys(rawTelemetry).length ? 'Vendor API' : 'Unavailable'
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
    totalAddMaterial:bsfDisplay(reading.totalAddedMaterialKg),
    singleAddMaterial:bsfDisplay(reading.singleAddedMaterialKg),
    totalDischarge:bsfDisplay(reading.totalDischargeKg),
    singleDischarge:bsfDisplay(reading.singleDischargeKg),
    discharge:bsfDisplay(reading.dischargeCode),
    runTime:bsfDisplay(reading.runTimeMin),
    temperature:bsfDisplay(reading.cabinTempC),
    hotPlateTemp:bsfDisplay(reading.hotPlateTempC),
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
    signal:reading.signalPct,
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
    totalAddMaterial:bsfDisplay(reading.totalAddedMaterialKg),
    singleAddMaterial:bsfDisplay(reading.singleAddedMaterialKg),
    totalDischarge:bsfDisplay(reading.totalDischargeKg),
    singleDischarge:bsfDisplay(reading.singleDischargeKg),
    discharge:bsfDisplay(reading.dischargeCode),
    runTime:bsfDisplay(reading.runTimeMin),
    temperature:bsfDisplay(reading.cabinTempC),
    hotPlateTemp:bsfDisplay(reading.hotPlateTempC),
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
    signal:reading.signalPct,
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
    api.getVendorDevices({ all:true, pageNum:1, pageSize:100 }),
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

function bsfRowSortTimestamp(row){
  return Number(row && row.sourceTimestampSeconds) || Number(row && row.receivedAtSeconds) || bsfEpochSeconds(row && row.recordedAt) || 0;
}

function bsfSnapshotFingerprint(deviceList, rows){
  return JSON.stringify({
    devices:deviceList.map(function(device){ return [device.id, device.status, device.lastUpdate, device.containerTemp, device.realTimeWeight, device.telemetry]; }),
    rows:rows.slice(0, 50).map(function(row){ return [row.device, row.recordedAt, row.temperature, row.weight, row.humidity]; })
  });
}

function bsfHistoryRecordedAt(value, groupBy){
  let text = String(value || '').trim();
  if(groupBy === 'month' && /^\d{4}-\d{2}$/.test(text)) text += '-01 00:00';
  if(groupBy === 'hour' && /^\d{4}-\d{2}-\d{2} \d{2}$/.test(text)) text += ':00';
  return text;
}

function bsfHistoryRow(item, device, groupBy){
  const rawRecordedAt = bsfHistoryRecordedAt(bsfField(item, ['recordedAt', 'recorded_at', 'time', 'timestamp']), groupBy);
  const recordedAt = bsfDate(rawRecordedAt);
  if(!recordedAt) return null;
  const temperature = bsfNumber(bsfField(item, ['temperature', 'CabinTemp', 'cabinTemp']));
  const humidity = bsfNumber(bsfField(item, ['humidity', 'Humidity']));
  return {
    recordedAt:bsfFormatTime(recordedAt),
    receivedAtSeconds:bsfEpochSeconds(recordedAt),
    sourceTimestampSeconds:bsfEpochSeconds(recordedAt),
    device:device.id,
    deviceState:bsfRawState(device.status),
    operatingStatus:device.operatingStatus || '\u2014',
    fermentState:device.fermentState || '\u2014',
    feed:'\u2014',
    shredder:'\u2014',
    mixingMotor:'\u2014',
    fan:'\u2014',
    zipper:'\u2014',
    weight:'\u2014',
    totalAddMaterial:'\u2014',
    singleAddMaterial:'\u2014',
    totalDischarge:'\u2014',
    singleDischarge:'\u2014',
    discharge:'\u2014',
    runTime:'\u2014',
    temperature:bsfDisplay(temperature),
    hotPlateTemp:'\u2014',
    humidity:bsfDisplay(humidity),
    energy:'\u2014',
    solarPower:'\u2014',
    co2:'\u2014',
    no2:'\u2014',
    h2s:'\u2014',
    gps:'\u2014',
    network:'Vendor history',
    signal:device.signal,
    vendorDeviceId:device.vendorDeviceId || '',
    history:true,
    volatile:false
  };
}

function bsfRawSampleRow(sample, device){
  const telemetry = bsfTelemetryObject(bsfField(sample, ['telemetry']) || {});
  const normalized = bsfField(sample, ['normalized']) || {};
  const data = Object.assign({}, telemetry, {
    cabin_temp_c:bsfField(normalized, ['cabinTempC']),
    humidity_pct:bsfField(normalized, ['humidityPct']),
    real_time_weight_kg:bsfField(normalized, ['realTimeWeightKg']),
    operating_status_code:bsfField(normalized, ['operatingStatusCode']),
    device_online_code:bsfField(normalized, ['onlineCode', 'deviceOnlineCode'])
  });
  const reading = bsfReadTelemetry(data);
  const rawRecordedAt = bsfField(sample, ['recordedAt', 'capturedAt']);
  const recordedAt = bsfDate(rawRecordedAt);
  if(!recordedAt) return null;
  const onlineCode = bsfField(normalized, ['onlineCode', 'deviceOnlineCode']);
  const sampleStatus = onlineCode === undefined || onlineCode === null || onlineCode === ''
    ? null
    : bsfStatusFromDeviceState(onlineCode);
  const state = sampleStatus || (device && device.status) || bsfOperatingStateFromCode(reading.operatingStatusCode) || 'offline';
  return {
    recordedAt:bsfFormatTime(recordedAt),
    receivedAtSeconds:bsfEpochSeconds(recordedAt),
    sourceTimestampSeconds:bsfEpochSeconds(rawRecordedAt),
    device:(device && device.id) || bsfSafeIdentifier(bsfField(sample, ['deviceId'])),
    deviceState:bsfRawState(state),
    operatingStatus:reading.operatingStatus,
    fermentState:reading.fermentState,
    feed:bsfDisplay(reading.feedCode),
    shredder:bsfDisplay(reading.shredderCode),
    mixingMotor:bsfDisplay(reading.mixingMotorCode),
    fan:bsfDisplay(reading.fanCode),
    zipper:bsfDisplay(reading.zipperCode),
    weight:bsfDisplay(reading.realTimeWeightKg),
    totalAddMaterial:bsfDisplay(reading.totalAddedMaterialKg),
    singleAddMaterial:bsfDisplay(reading.singleAddedMaterialKg),
    totalDischarge:bsfDisplay(reading.totalDischargeKg),
    singleDischarge:bsfDisplay(reading.singleDischargeKg),
    discharge:bsfDisplay(reading.dischargeCode),
    runTime:bsfDisplay(reading.runTimeMin),
    temperature:bsfDisplay(reading.cabinTempC),
    hotPlateTemp:bsfDisplay(reading.hotPlateTempC),
    humidity:bsfDisplay(reading.humidityPct),
    energy:bsfDisplay(reading.energyKwh),
    solarPower:bsfDisplay(reading.solarPowerKw),
    co2:bsfDisplay(reading.co2Ppm),
    no2:bsfDisplay(reading.no2Ppm),
    h2s:bsfDisplay(reading.h2sPpm),
    gps:'\u2014',
    network:'Scheduled collector',
    signal:reading.signalPct,
    vendorDeviceId:bsfField(sample, ['deviceId']) || (device && device.vendorDeviceId) || '',
    history:true,
    volatile:false
  };
}

async function bsfLoadRawSamples(options){
  const api = await bsfWaitForBackendApi();
  if(!api || typeof api.getRawSamples !== 'function') throw new Error('Raw sample API is unavailable');
  const response = await api.getRawSamples({
    page:options && options.page || 1,
    pageSize:options && options.pageSize || 30,
    start:options && options.start,
    end:options && options.end,
    clientId:options && options.clientId || undefined,
    machineId:options && options.machineId || undefined
  });
  const devices = options && Array.isArray(options.devices) ? options.devices : [];
  const byVendorId = new Map();
  devices.forEach(function(device){
    if(device.vendorDeviceId) byVendorId.set(String(device.vendorDeviceId), device);
  });
  const items = bsfList(response, 'items');
  const rows = items.map(function(item){
    return bsfRawSampleRow(item, byVendorId.get(String(bsfField(item, ['deviceId']) || '')));
  }).filter(Boolean);
  return {
    rows:rows,
    total:Number(bsfField(response, ['total'])) || 0,
    page:Number(bsfField(response, ['page'])) || (options && options.page) || 1,
    pageSize:Number(bsfField(response, ['pageSize'])) || (options && options.pageSize) || 30
  };
}
function bsfMergeRows(baseRows, extraRows){
  const rows = new Map();
  baseRows.forEach(function(row){
    if(row && row.device && row.recordedAt) rows.set(row.device + '@' + (row.sourceTimestampSeconds || row.recordedAt), row);
  });
  extraRows.forEach(function(row){
    if(row && row.device && row.recordedAt) rows.set(row.device + '@' + (row.sourceTimestampSeconds || row.recordedAt), row);
  });
  return Array.from(rows.values()).sort(function(a, b){
    return bsfRowSortTimestamp(b) - bsfRowSortTimestamp(a);
  });
}

async function bsfLoadVendorHistory(options){
  const api = await bsfWaitForBackendApi();
  if(!api || typeof api.getVendorHistory !== 'function') throw new Error('History API is unavailable');
  const device = options && options.device;
  if(!device || !device.id) throw new Error('A device is required');
  const response = await api.getVendorHistory({
    deviceId:device.vendorDeviceId || device.id,
    start:options.start,
    end:options.end,
    groupBy:options.groupBy || 'raw'
  });
  const items = bsfList(response, 'items');
  return items.map(function(item){ return bsfHistoryRow(item, device, options.groupBy || 'raw'); }).filter(Boolean);
}

window.BSF_LOAD_VENDOR_HISTORY = bsfLoadVendorHistory;
window.BSF_LOAD_RAW_SAMPLES = bsfLoadRawSamples;
window.BSF_MERGE_ROWS = bsfMergeRows;

const RAW_HISTORY_STORAGE_PREFIX = 'bsf.delivery.rawHistory.v1';
const RAW_HISTORY_MAX_ROWS = 5000;

function bsfHistoryStorageKey(){
  const profile = window.BSF_SESSION?.user || window.BSF_USER_PROFILE || window.BSF_CURRENT_USER || {};
  const role = typeof currentRole === 'undefined' ? 'unknown' : currentRole;
  const user = profile.id || profile.userName || profile.email || (typeof currentUsername === 'undefined' ? '' : currentUsername);
  const scope = profile.machineId || (typeof currentMachineId === 'undefined' ? '' : currentMachineId) ||
    profile.clientId || (typeof currentClient === 'undefined' ? '' : currentClient) || 'all';
  return RAW_HISTORY_STORAGE_PREFIX + ':' + bsfSafeIdentifier(role) + ':' + bsfSafeIdentifier(user) + ':' + bsfSafeIdentifier(scope);
}

function bsfReadStoredHistory(){
  try {
    const parsed = JSON.parse(localStorage.getItem(bsfHistoryStorageKey()) || '[]');
    return Array.isArray(parsed) ? parsed.filter(function(row){ return row && row.device && row.recordedAt; }) : [];
  } catch(error) {
    return [];
  }
}

function bsfWriteStoredHistory(rows){
  const ordered = rows.slice(0, RAW_HISTORY_MAX_ROWS);
  try {
    localStorage.setItem(bsfHistoryStorageKey(), JSON.stringify(ordered));
  } catch(error) {
    try { localStorage.setItem(bsfHistoryStorageKey(), JSON.stringify(ordered.slice(0, Math.floor(ordered.length / 2)))); } catch(ignored) {}
  }
}

function bsfRowValueFingerprint(row){
  return JSON.stringify([
    row.deviceState, row.operatingStatus, row.fermentState, row.feed, row.shredder,
    row.mixingMotor, row.fan, row.zipper, row.weight, row.totalAddMaterial,
    row.singleAddMaterial, row.totalDischarge, row.singleDischarge, row.discharge,
    row.runTime, row.temperature, row.hotPlateTemp, row.humidity, row.energy, row.solarPower,
    row.co2, row.no2, row.h2s, row.gps, row.signal
  ]);
}

function bsfRefreshIntervalSeconds(){
  const role = typeof currentRole === 'undefined' ? 'user' : currentRole;
  const roleKey = role === 'client-admin' ? 'clientAdmin' : role;
  const defaults = { admin:180, clientAdmin:600, user:600 };
  const configured = window.BSF_RUNTIME_CONFIG && window.BSF_RUNTIME_CONFIG.refreshMs &&
    Number(window.BSF_RUNTIME_CONFIG.refreshMs[roleKey]);
  return Number.isFinite(configured) && configured >= 30000 ? Math.round(configured / 1000) : (defaults[roleKey] || 600);
}

function bsfRealtimeSampleBucket(row, intervalSeconds){
  const receivedAt = Number(row && row.receivedAtSeconds) || bsfRowSortTimestamp(row);
  return receivedAt ? Math.floor(receivedAt / intervalSeconds) : 0;
}

function bsfAppendHistoryRows(existingRows, incomingRows){
  const rows = (existingRows || []).slice();
  const exactIndexes = new Map();
  const intervalSeconds = bsfRefreshIntervalSeconds();
  rows.forEach(function(row, index){
    if(row.sourceTimestampSeconds) exactIndexes.set(row.device + '@' + row.sourceTimestampSeconds, index);
  });

  (incomingRows || []).forEach(function(row){
    if(!row || !row.device || !row.recordedAt) return;
    if(row.sourceTimestampSeconds){
      const key = row.device + '@' + row.sourceTimestampSeconds;
      const existingIndex = exactIndexes.get(key);
      if(existingIndex === undefined){
        exactIndexes.set(key, rows.length);
        rows.push(row);
      } else {
        rows[existingIndex] = row;
      }
      return;
    }

    const incomingBucket = bsfRealtimeSampleBucket(row, intervalSeconds);
    let latest = null;
    let sameBucketIndex = -1;
    rows.forEach(function(existing, index){
      if(existing.device !== row.device) return;
      if(existing.volatile && !existing.sourceTimestampSeconds &&
        incomingBucket && bsfRealtimeSampleBucket(existing, intervalSeconds) === incomingBucket){
        sameBucketIndex = index;
      }
      if(!latest || bsfRowSortTimestamp(existing) > bsfRowSortTimestamp(latest)) latest = existing;
    });

    if(sameBucketIndex >= 0){
      rows[sameBucketIndex] = row;
      return;
    }
    if(!incomingBucket && latest && latest.volatile &&
      bsfRowValueFingerprint(latest) === bsfRowValueFingerprint(row)) return;
    rows.push(row);
  });

  return rows.sort(function(left, right){
    return bsfRowSortTimestamp(right) - bsfRowSortTimestamp(left) ||
      String(right.recordedAt).localeCompare(String(left.recordedAt));
  }).slice(0, RAW_HISTORY_MAX_ROWS);
}

function bsfLatestRowsByDevice(rows){
  const latest = new Map();
  (rows || []).forEach(function(row){
    if(!row || !row.device) return;
    const current = latest.get(row.device);
    if(!current || bsfRowSortTimestamp(row) > bsfRowSortTimestamp(current) ||
      (bsfRowSortTimestamp(row) === bsfRowSortTimestamp(current) && String(row.recordedAt) > String(current.recordedAt))) latest.set(row.device, row);
  });
  return Array.from(latest.values());
}

function bsfRowsForCurrentScope(snapshot){
  const role = typeof currentRole === 'undefined' ? 'admin' : currentRole;
  if(role === 'admin') return snapshot.rows;
  // Vendor rows are already scoped by the authenticated vendor token. Keep the
  // latest row even when the vendor device is not linked to a local Client yet.
  return bsfLatestRowsByDevice(snapshot.rows);
}

async function bsfLoadBackendData(limit){
  const snapshot = await bsfFetchSnapshot(limit);
  const fingerprint = bsfSnapshotFingerprint(snapshot.devices, snapshot.rows);
  const previousFingerprint = window.BSF_BACKEND_LAST_FINGERPRINT;
  const existingRows = bsfReadStoredHistory();
  const incomingRows = bsfRowsForCurrentScope(snapshot);
  const mergedRows = bsfAppendHistoryRows(existingRows, incomingRows);
  const historyChanged = JSON.stringify(existingRows) !== JSON.stringify(mergedRows);
  const changed = previousFingerprint !== fingerprint || historyChanged;
  window.BSF_BACKEND_LAST_FINGERPRINT = fingerprint;
  if(historyChanged) bsfWriteStoredHistory(mergedRows);
  if(historyChanged && typeof currentPage !== 'undefined' && currentPage === 'raw-data' &&
    typeof rawDataPage !== 'undefined') rawDataPage = 1;
  devices.splice(0, devices.length, ...snapshot.devices);
  rawDataRows.splice(0, rawDataRows.length, ...mergedRows);
  window.BSF_GRAPH_HISTORY_ROWS = mergedRows.slice();
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

window.BSF_LOAD_BACKEND_LATEST = async function(limit){
  try {
    const result = await bsfLoadBackendData(limit == null ? 1000 : limit);
    return result.changed;
  } catch(error) {
    console.warn('[BSF] API latest load failed:', error.message);
    return false;
  }
};

window.BSF_BACKEND_DATA = {
  formatTime:bsfFormatTime,
  readTelemetry:bsfReadTelemetry,
  buildSnapshot:bsfBuildSnapshot,
  historyRow:bsfHistoryRow,
  rawSampleRow:bsfRawSampleRow,
  mergeRows:bsfMergeRows,
  appendRows:bsfAppendHistoryRows,
  rowValueFingerprint:bsfRowValueFingerprint
};
