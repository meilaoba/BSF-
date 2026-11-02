import { config } from '../config.js';
import { fetchAllVendorDailyStats } from '../providers/vendor-daily-stats.js';
import { hongKongDateKey } from '../shared/metrics.js';

function withinRange(dateKey, start, end, today) {
  return dateKey >= start && dateKey <= end && dateKey <= today;
}

export function dailyStatSnapshot(record, deviceId, settings = {}) {
  const kitchenWaste = Number(record?.kitchenWaste);
  const powerConsume = Number(record?.powerConsume);
  const runTime = Number(record?.runTime);
  const wasteKg = Number.isFinite(kitchenWaste)
    ? kitchenWaste * config.auth.vendor.kitchenWasteToKgFactor
    : null;
  const energyKwh = Number.isFinite(powerConsume)
    ? powerConsume * config.auth.vendor.powerConsumeToKwhFactor
    : null;
  const runTimeHours = Number.isFinite(runTime) ? runTime : null;
  return {
    capturedAt: `${record.statDate}T12:00:00+08:00`,
    deviceId: String(deviceId),
    wasteKg,
    energyKwh,
    runTimeHours,
    operatingStatusCode: (runTimeHours > 0 || energyKwh !== 0) ? 2 : 0,
    dailyAggregate: true,
    clientRegion: settings.clientRegion ?? null,
    ghgFormula: settings.ghgFormula ?? null,
  };
}

export async function loadVendorDailyStatSnapshots({
  token,
  devices,
  start,
  end,
  settingsByDevice = new Map(),
} = {}) {
  if (!Array.isArray(devices) || !devices.length) {
    return { snapshots: [], unavailableDeviceCount: 0 };
  }
  const today = hongKongDateKey(new Date());
  const snapshots = [];
  let unavailableDeviceCount = 0;
  for (const device of devices) {
    if (!device?.deviceName) continue;
    let records;
    try {
      records = await fetchAllVendorDailyStats({
        token,
        deviceName: device.deviceName,
        startTime: start,
        endTime: end,
      });
    } catch (error) {
      unavailableDeviceCount += 1;
      console.warn(
        `[vendor-daily-stats] device ${device.id || 'unknown'} unavailable:`,
        error.code || error.message
      );
      continue;
    }
    const settings = settingsByDevice.get(String(device.id)) || {};
    for (const record of records) {
      if (!withinRange(record.statDate, start, end, today)) continue;
      snapshots.push(dailyStatSnapshot(record, device.id, settings));
    }
  }
  return { snapshots, unavailableDeviceCount };
}
