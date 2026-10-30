import { config } from '../config.js';
import { query } from '../db.js';
import { hongKongDateKey } from '../shared/metrics.js';
import {
  fetchHkoCurrentTemperature,
  fetchHkoOfficialDailyMean,
} from '../providers/hko-weather.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAMPLE_CACHE_MS = 25 * 60 * 1000;

function validDateKey(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function environmentSampleIsFresh(sample, dateKey, now = new Date(), maxAgeMs = SAMPLE_CACHE_MS) {
  const fetchedAt = new Date(sample?.fetched_at || sample?.fetchedAt || '');
  const observedAt = new Date(sample?.observed_at || sample?.observedAt || '');
  if (!Number.isFinite(fetchedAt.getTime()) || !Number.isFinite(observedAt.getTime())) return false;
  if (hongKongDateKey(observedAt) !== dateKey) return false;
  return now.getTime() - fetchedAt.getTime() < maxAgeMs;
}

async function saveCurrentSample(now = new Date(), dateKey = hongKongDateKey(now)) {
  const latest = await query(
    `SELECT fetched_at, observed_at
       FROM environment_temperature_samples
      WHERE station = $1
      ORDER BY fetched_at DESC
      LIMIT 1`,
    [config.environment.hkoStation]
  );
  if (environmentSampleIsFresh(latest.rows[0], dateKey, now)) {
    return { cached: true };
  }
  const sample = await fetchHkoCurrentTemperature();
  await query(
    `INSERT INTO environment_temperature_samples
       (station, observed_at, temperature_c, source, fetched_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (station, observed_at) DO UPDATE SET
       temperature_c = EXCLUDED.temperature_c,
       source = EXCLUDED.source,
       fetched_at = now()`,
    [sample.station, sample.observedAt, sample.temperatureC, sample.source]
  );
  return { cached: false, sample };
}

async function loadProvisionalDaily(dateKey) {
  const { rows } = await query(
    `SELECT avg(temperature_c) AS average_temp_c,
            count(*)::int AS sample_count,
            max(observed_at) AS captured_at
       FROM environment_temperature_samples
      WHERE station = $1
        AND observed_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Hong_Kong')
        AND observed_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Hong_Kong')`,
    [config.environment.hkoStation, dateKey]
  );
  const row = rows[0] || {};
  const value = Number(row.average_temp_c);
  if (!row.sample_count || !Number.isFinite(value)) return null;
  return {
    station: config.environment.hkoStation,
    stationName: config.environment.hkoStationName,
    date: dateKey,
    temperatureC: value,
    status: 'provisional',
    source: 'hko_rhrread',
    sampleCount: Number(row.sample_count),
    capturedAt: row.captured_at,
  };
}

async function loadStoredOfficial(dateKey) {
  const { rows } = await query(
    `SELECT average_temp_c, status, source, fetched_at
       FROM environment_daily_temperature
      WHERE station = $1 AND temperature_date = $2`,
    [config.environment.hkoStation, dateKey]
  );
  if (!rows[0]) return null;
  return {
    station: config.environment.hkoStation,
    stationName: config.environment.hkoStationName,
    date: dateKey,
    temperatureC: Number(rows[0].average_temp_c),
    status: rows[0].status,
    source: rows[0].source,
    capturedAt: rows[0].fetched_at,
  };
}

export async function getEnvironmentTemperature(dateKey, now = new Date()) {
  const today = hongKongDateKey(now);
  const selectedDate = dateKey || today;
  if (!validDateKey(selectedDate)) throw new Error('invalid environment temperature date');

  if (selectedDate === today) {
    let sampleUnavailable = false;
    try {
      await saveCurrentSample(now, selectedDate);
    } catch (error) {
      sampleUnavailable = true;
      console.warn('[hko] current temperature unavailable:', error.code || error.message);
    }
    const provisional = await loadProvisionalDaily(selectedDate);
    if (provisional) return { ...provisional, stale: sampleUnavailable };
    return null;
  }

  const stored = await loadStoredOfficial(selectedDate);
  if (stored) return stored;
  try {
    const official = await fetchHkoOfficialDailyMean(selectedDate);
    if (official) {
      await query(
        `INSERT INTO environment_daily_temperature
           (station, temperature_date, average_temp_c, status, source, fetched_at)
         VALUES ($1,$2,$3,'official',$4,now())
         ON CONFLICT (station, temperature_date) DO UPDATE SET
           average_temp_c = EXCLUDED.average_temp_c,
           status = EXCLUDED.status,
           source = EXCLUDED.source,
           fetched_at = now()`,
        [official.station, selectedDate, official.temperatureC, official.source]
      );
      return {
        ...official,
        status: 'official',
        capturedAt: now,
      };
    }
  } catch (error) {
    console.warn('[hko] official daily temperature unavailable:', error.code || error.message);
  }
  return loadProvisionalDaily(selectedDate);
}
