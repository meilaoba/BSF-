export const DEFAULT_TEMPERATURE_THRESHOLDS = { low: 12, high: 58 };

export function readTemperature(deviceData) {
  if (!deviceData) return null;
  const raw = deviceData.CabinTemp !== undefined ? deviceData.CabinTemp : deviceData.containerTemp;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function evaluateTemperatureAlert(deviceData, thresholds = DEFAULT_TEMPERATURE_THRESHOLDS) {
  const temperature = readTemperature(deviceData);
  if (temperature === null || temperature <= 0) return null;
  if (temperature > thresholds.high) return { type: 'Temperature High', level: 'Critical', value: temperature, threshold: thresholds.high };
  if (temperature < thresholds.low) return { type: 'Temperature Low', level: 'Critical', value: temperature, threshold: thresholds.low };
  return null;
}

export function createAlertNotification(alert, channels = ['email']) {
  return {
    deviceId: alert.deviceId,
    type: alert.type,
    value: alert.value,
    threshold: alert.threshold,
    channels
  };
}
