export const HONG_KONG_TIME_ZONE = 'Asia/Hong_Kong';
export const FIXED_DAILY_ADJUSTMENT = (1.93 * 12) / 365;
export const FERTILIZER_RATIO = 0.12;
export const ENERGY_PER_STANDBY_DAY_KWH = 1.5;
export const DEFAULT_FORMULA_CONFIG = Object.freeze({
  wasteReductionFactor: 1.5,
  energyFactorHkIsland: 0.71,
  energyFactorOther: 0.37,
  transportConstant: 1.93,
  transportMonths: 12,
  transportDays: 365,
  fertilizerRatio: FERTILIZER_RATIO,
  standbyEnergyKwh: ENERGY_PER_STANDBY_DAY_KWH,
  humidityScale: 1,
});

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formulaNumber(formula, key) {
  const value = Number(formula && formula[key]);
  return Number.isFinite(value) ? value : DEFAULT_FORMULA_CONFIG[key];
}

function fixedDailyAdjustment(formula = {}) {
  const constant = formulaNumber(formula, 'transportConstant');
  const months = formulaNumber(formula, 'transportMonths');
  const days = formulaNumber(formula, 'transportDays');
  return days > 0 ? (constant * months) / days : FIXED_DAILY_ADJUSTMENT;
}

export function asDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function hongKongParts(value) {
  const date = asDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HONG_KONG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function hongKongDateKey(value) {
  const parts = hongKongParts(value);
  if (!parts) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function hongKongMonthKey(value) {
  const key = hongKongDateKey(value);
  return key ? key.slice(0, 7) : '';
}

export function hongKongHourKey(value) {
  const parts = hongKongParts(value);
  if (!parts) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:00`;
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodRange({ period = 'monthly', year, month, date, now = new Date() } = {}) {
  const current = hongKongParts(now) || { year: 1970, month: 1, day: 1 };
  const selectedYear = Number.isInteger(Number(year)) && Number(year) >= 2000 && Number(year) <= 2100
    ? Number(year)
    : current.year;
  if (period === 'daily') {
    const selectedDate = DATE_KEY_PATTERN.test(String(date || '')) ? String(date) : hongKongDateKey(now);
    return { start: selectedDate, end: selectedDate, groupBy: 'hour' };
  }
  if (period === 'yearly') {
    return { start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31`, groupBy: 'month' };
  }
  const selectedMonth = Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12
    ? Number(month)
    : current.month;
  const monthText = String(selectedMonth).padStart(2, '0');
  return {
    start: `${selectedYear}-${monthText}-01`,
    end: `${selectedYear}-${monthText}-${String(lastDayOfMonth(selectedYear, selectedMonth)).padStart(2, '0')}`,
    groupBy: 'day',
  };
}

function dateKeysBetween(start, end) {
  if (!DATE_KEY_PATTERN.test(start) || !DATE_KEY_PATTERN.test(end) || start > end) return [];
  const keys = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function bucketKeys(groupBy, start, end) {
  if (groupBy === 'hour') {
    const day = DATE_KEY_PATTERN.test(start) ? start : end;
    return Array.from({ length: 24 }, (_, hour) => `${day} ${String(hour).padStart(2, '0')}:00`);
  }
  if (groupBy === 'month') {
    if (!MONTH_KEY_PATTERN.test(String(start).slice(0, 7)) || !MONTH_KEY_PATTERN.test(String(end).slice(0, 7))) return [];
    const keys = [];
    let year = Number(start.slice(0, 4));
    let month = Number(start.slice(5, 7));
    const endYear = Number(end.slice(0, 4));
    const endMonth = Number(end.slice(5, 7));
    while (year < endYear || (year === endYear && month <= endMonth)) {
      keys.push(`${year}-${String(month).padStart(2, '0')}`);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return keys;
  }
  return dateKeysBetween(start, end);
}

export function bucketKeyForDate(value, groupBy) {
  if (groupBy === 'hour') return hongKongHourKey(value);
  if (groupBy === 'month') return hongKongMonthKey(value);
  return hongKongDateKey(value);
}

export function regionalEnergyFactor(region, formula = {}) {
  const normalized = String(region || '').trim().toLowerCase();
  if (['hk', 'hong kong island', '港岛', '港島'].includes(normalized)) return formulaNumber(formula, 'energyFactorHkIsland');
  return formulaNumber(formula, 'energyFactorOther');
}

export function tonsToKg(value) {
  const tons = finiteNumber(value);
  return tons === null ? null : tons * 1000;
}

export function energyForStandbyDays(standbyDays, formula = {}) {
  const days = finiteNumber(standbyDays);
  return days === null || days < 0 ? null : days * formulaNumber(formula, 'standbyEnergyKwh');
}

export function fertilizerKg(wasteKg, formula = {}) {
  const waste = finiteNumber(wasteKg);
  return waste === null || waste < 0 ? null : waste * formulaNumber(formula, 'fertilizerRatio');
}

export function ghgReducedKg(wasteKg, energyKwh, region, adjustmentDays = 1, formula = {}) {
  const waste = finiteNumber(wasteKg);
  const energy = finiteNumber(energyKwh);
  const days = finiteNumber(adjustmentDays);
  if (waste === null || energy === null || days === null || days < 0) return null;
  return waste * formulaNumber(formula, 'wasteReductionFactor')
    - energy * regionalEnergyFactor(region, formula)
    - fixedDailyAdjustment(formula) * days;
}

function normalizeSnapshotRow(row, formula = {}) {
  if (!row || typeof row !== 'object') return null;
  const capturedAt = asDate(row.capturedAt ?? row.captured_at ?? row.recordedAt ?? row.recorded_at);
  if (!capturedAt) return null;
  return {
    capturedAt,
    deviceId: String(row.deviceId ?? row.vendorDeviceId ?? row.vendor_device_id ?? 'unknown'),
    cabinTempC: finiteNumber(row.cabinTempC ?? row.cabin_temp_c),
    humidityPct: (() => {
      const humidity = finiteNumber(row.humidityPct ?? row.humidity_pct);
      return humidity === null ? null : humidity * formulaNumber(formula, 'humidityScale');
    })(),
    operatingStatusCode: finiteNumber(row.operatingStatusCode ?? row.operating_status_code),
    dailyInputT: finiteNumber(row.dailyInputT ?? row.daily_input_t),
    monthlyInputT: finiteNumber(row.monthlyInputT ?? row.monthly_input_t),
    yearlyInputT: finiteNumber(row.yearlyInputT ?? row.yearly_input_t),
  };
}

function maxKnown(current, candidate) {
  if (candidate === null) return current;
  return current === null ? candidate : Math.max(current, candidate);
}

function addToMap(map, key, value) {
  if (value === null) return;
  map.set(key, (map.get(key) || 0) + value);
}

function emptyToNull(value) {
  return Number.isFinite(value) ? value : null;
}

export function aggregateTelemetrySnapshots(rows, {
  groupBy = 'day',
  start,
  end,
  region = 'non-hk',
  summaryMode = groupBy === 'month' ? 'yearly' : groupBy === 'hour' ? 'daily' : 'monthly',
  now = new Date(),
  formula = {},
} = {}) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => normalizeSnapshotRow(row, formula)).filter(Boolean);
  const unique = new Map();
  for (const row of normalized) {
    const key = `${row.deviceId}|${Math.floor(row.capturedAt.getTime() / 1000)}`;
    unique.set(key, row);
  }
  const nowDate = asDate(now) || new Date();
  const data = Array.from(unique.values())
    .filter((row) => row.capturedAt <= nowDate)
    .sort((a, b) => a.capturedAt - b.capturedAt);
  const keys = bucketKeys(groupBy, start, end);
  const currentBucket = bucketKeyForDate(now, groupBy);

  const deviceDays = new Map();
  const deviceMonths = new Map();
  const deviceYears = new Map();
  const readingsByBucketDevice = new Map();
  let minTemp = null;
  let maxTemp = null;
  let tempSum = 0;
  let tempCount = 0;
  let humiditySum = 0;
  let humidityCount = 0;
  const tempBucketStats = new Map();
  const humidityBucketStats = new Map();

  for (const row of data) {
    const dateKey = hongKongDateKey(row.capturedAt);
    const monthKey = dateKey.slice(0, 7);
    const yearKey = dateKey.slice(0, 4);
    const dayKey = `${row.deviceId}|${dateKey}`;
    const day = deviceDays.get(dayKey) || {
      deviceId: row.deviceId,
      dateKey,
      monthKey,
      last: row,
      maxDailyInputT: null,
      hasStandby: false,
    };
    day.last = row;
    day.maxDailyInputT = maxKnown(day.maxDailyInputT, row.dailyInputT);
    day.hasStandby = day.hasStandby || row.operatingStatusCode === 1;
    deviceDays.set(dayKey, day);

    const month = deviceMonths.get(`${row.deviceId}|${monthKey}`) || {
      deviceId: row.deviceId,
      monthKey,
      maxMonthlyInputT: null,
    };
    month.maxMonthlyInputT = maxKnown(month.maxMonthlyInputT, row.monthlyInputT);
    deviceMonths.set(`${row.deviceId}|${monthKey}`, month);

    const year = deviceYears.get(`${row.deviceId}|${yearKey}`) || {
      deviceId: row.deviceId,
      yearKey,
      maxYearlyInputT: null,
    };
    year.maxYearlyInputT = maxKnown(year.maxYearlyInputT, row.yearlyInputT);
    deviceYears.set(`${row.deviceId}|${yearKey}`, year);

    const bucket = bucketKeyForDate(row.capturedAt, groupBy);
    readingsByBucketDevice.set(`${bucket}|${row.deviceId}`, row);

    if (row.cabinTempC !== null) {
      tempSum += row.cabinTempC;
      tempCount += 1;
      minTemp = minTemp === null ? row.cabinTempC : Math.min(minTemp, row.cabinTempC);
      maxTemp = maxTemp === null ? row.cabinTempC : Math.max(maxTemp, row.cabinTempC);
      const stats = tempBucketStats.get(bucket) || { sum: 0, count: 0 };
      stats.sum += row.cabinTempC;
      stats.count += 1;
      tempBucketStats.set(bucket, stats);
    }
    if (row.humidityPct !== null) {
      humiditySum += row.humidityPct;
      humidityCount += 1;
      const stats = humidityBucketStats.get(bucket) || { sum: 0, count: 0 };
      stats.sum += row.humidityPct;
      stats.count += 1;
      humidityBucketStats.set(bucket, stats);
    }
  }

  const foodByBucket = new Map();
  const energyByBucket = new Map();
  const ghgByBucket = new Map();

  if (groupBy === 'hour') {
    // dailyInput is a cumulative day-to-date value. Convert consecutive hourly
    // snapshots into increments so an hour is not charged the whole day again.
    const hourlyInputs = new Map();
    for (const [key, row] of readingsByBucketDevice) {
      const separator = key.lastIndexOf('|');
      const bucket = key.slice(0, separator);
      const deviceId = key.slice(separator + 1);
      const list = hourlyInputs.get(deviceId) || [];
      list.push({ bucket, row });
      hourlyInputs.set(deviceId, list);
    }
    for (const list of hourlyInputs.values()) {
      list.sort((left, right) => left.bucket.localeCompare(right.bucket));
      let previous = 0;
      let previousDay = '';
      for (const item of list) {
        const day = item.bucket.slice(0, 10);
        if (day !== previousDay) {
          previous = 0;
          previousDay = day;
        }
        const current = tonsToKg(item.row.dailyInputT);
        if (current === null) continue;
        const increment = current >= previous ? current - previous : current;
        addToMap(foodByBucket, item.bucket, increment);
        previous = current;
      }
    }
  } else {
    for (const [key, row] of readingsByBucketDevice) {
      const separator = key.lastIndexOf('|');
      const bucket = key.slice(0, separator);
      if (bucket > currentBucket) continue;
      const wasteKg = tonsToKg(groupBy === 'month' ? row.monthlyInputT : row.dailyInputT);
      addToMap(foodByBucket, bucket, wasteKg);
    }
  }

  for (const day of deviceDays.values()) {
    if (!day.hasStandby) continue;
    const energy = formulaNumber(formula, 'standbyEnergyKwh');
    if (groupBy === 'hour') {
      const bucket = bucketKeyForDate(day.last.capturedAt, 'hour');
      if (bucket <= currentBucket) addToMap(energyByBucket, bucket, energy);
    } else if (groupBy === 'month') {
      addToMap(energyByBucket, day.monthKey, energy);
    } else {
      addToMap(energyByBucket, day.dateKey, energy);
    }
  }

  if (groupBy === 'hour') {
    const keysByDay = new Map();
    for (const key of keys) {
      const day = key.slice(0, 10);
      const dayKeys = keysByDay.get(day) || [];
      dayKeys.push(key);
      keysByDay.set(day, dayKeys);
    }
    for (const dayKeys of keysByDay.values()) {
      let cumulativeWaste = 0;
      let cumulativeEnergy = 0;
      let seenWaste = false;
      for (const key of dayKeys) {
        if (key > currentBucket) continue;
        const waste = foodByBucket.get(key);
        if (waste !== undefined) {
          cumulativeWaste += waste;
          seenWaste = true;
        }
        cumulativeEnergy += energyByBucket.get(key) || 0;
        if (seenWaste) {
          ghgByBucket.set(
            key,
            cumulativeWaste * 1.5
              - cumulativeEnergy * regionalEnergyFactor(region, formula)
              - fixedDailyAdjustment(formula),
          );
        }
      }
    }
  } else if (groupBy === 'month') {
    for (const month of deviceMonths.values()) {
      if (month.monthKey > currentBucket || !keys.includes(month.monthKey)) continue;
      const wasteKg = tonsToKg(month.maxMonthlyInputT);
      if (wasteKg === null) continue;
      const standbyDays = Array.from(deviceDays.values()).filter((day) => day.deviceId === month.deviceId && day.monthKey === month.monthKey && day.hasStandby).length;
      const energyKwh = energyForStandbyDays(standbyDays, formula) || 0;
      const observedDays = new Set(Array.from(deviceDays.values()).filter((day) => day.deviceId === month.deviceId && day.monthKey === month.monthKey).map((day) => day.dateKey)).size;
      const value = ghgReducedKg(wasteKg, energyKwh, region, observedDays, formula);
      if (value !== null) addToMap(ghgByBucket, month.monthKey, value);
    }
  } else {
    for (const day of deviceDays.values()) {
      if (day.dateKey > currentBucket) continue;
      const wasteKg = tonsToKg(day.maxDailyInputT);
      if (wasteKg === null) continue;
      const energyKwh = day.hasStandby ? formulaNumber(formula, 'standbyEnergyKwh') : 0;
      const value = ghgReducedKg(wasteKg, energyKwh, region, 1, formula);
      if (value !== null) addToMap(ghgByBucket, day.dateKey, value);
    }
  }

  const makeSeries = (source) => keys.map((key) => ({
    date: key,
    label: key,
    value: key > currentBucket ? null : emptyToNull(source.get(key)),
  }));

  const items = makeSeries(foodByBucket);
  const energyItems = makeSeries(energyByBucket);
  const ghgItems = makeSeries(ghgByBucket);
  const tempItems = keys.map((key) => {
    const stats = tempBucketStats.get(key);
    return { date: key, label: key, value: key > currentBucket || !stats ? null : stats.count ? stats.sum / stats.count : null };
  });
  const humidityItems = keys.map((key) => {
    const stats = humidityBucketStats.get(key);
    return { date: key, label: key, value: key > currentBucket || !stats ? null : stats.count ? stats.sum / stats.count : null };
  });

  let wasteKg = null;
  if (summaryMode === 'yearly') {
    const yearly = Array.from(deviceYears.values());
    if (yearly.some((row) => row.maxYearlyInputT !== null)) {
      wasteKg = yearly.reduce((sum, row) => sum + (tonsToKg(row.maxYearlyInputT) || 0), 0);
    } else {
      const monthly = Array.from(deviceMonths.values());
      if (monthly.some((row) => row.maxMonthlyInputT !== null)) {
        wasteKg = monthly.reduce((sum, row) => sum + (tonsToKg(row.maxMonthlyInputT) || 0), 0);
      }
    }
  } else if (summaryMode === 'monthly') {
    const monthly = Array.from(deviceMonths.values());
    if (monthly.some((row) => row.maxMonthlyInputT !== null)) {
      wasteKg = monthly.reduce((sum, row) => sum + (tonsToKg(row.maxMonthlyInputT) || 0), 0);
    }
  } else {
    const daily = Array.from(deviceDays.values());
    if (daily.some((row) => row.maxDailyInputT !== null)) {
      wasteKg = daily.reduce((sum, row) => sum + (tonsToKg(row.maxDailyInputT) || 0), 0);
    }
  }
  if (wasteKg === null) {
    const seriesTotal = items.reduce((sum, item) => sum + (item.value || 0), 0);
    if (items.some((item) => item.value !== null)) wasteKg = seriesTotal;
  }

  const standbyDeviceDays = Array.from(deviceDays.values()).filter((day) => day.hasStandby).length;
  const energyKwh = standbyDeviceDays ? energyForStandbyDays(standbyDeviceDays, formula) : (data.length ? 0 : null);
  const observedDeviceDays = deviceDays.size;
  const ghgKg = wasteKg === null || energyKwh === null || !observedDeviceDays
    ? null
    : ghgReducedKg(wasteKg, energyKwh, region, observedDeviceDays, formula);
  const summary = {
    wasteKg,
    ghgKg,
    energyKwh,
    fertilizerKg: fertilizerKg(wasteKg, formula),
    avgTempC: tempCount ? tempSum / tempCount : null,
    minTempC: minTemp,
    maxTempC: maxTemp,
    avgHumidityPct: humidityCount ? humiditySum / humidityCount : null,
    standbyDeviceDays,
    observedDeviceDays,
    pointCount: items.filter((item) => item.value !== null).length,
  };

  return { items, ghgItems, energyItems, tempItems, humidityItems, summary };
}
