import { query, withTransaction } from '../db.js';

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, max = 300) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sourceDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function vendorAccountIdForSession(session) {
  return cleanText(
    session?.user?.vendorUserId
      ?? session?.user?.vendor_user_id
      ?? session?.user?.id,
    160
  );
}

export async function recordVendorTelemetrySamples(devices, {
  vendorAccountId,
  capturedAt = new Date(),
  sampleSource = 'request',
  sampleIntervalSeconds = null,
} = {}) {
  const accountId = cleanText(vendorAccountId, 160);
  if (!accountId || !Array.isArray(devices) || !devices.length) return 0;
  const captureDate = sourceDate(capturedAt) || new Date();
  const roundedCapture = new Date(Math.floor(captureDate.getTime() / 1000) * 1000);
  const source = sampleSource === 'worker' ? 'worker' : 'request';
  const interval = source === 'worker' ? finiteNumber(sampleIntervalSeconds) : null;
  if (source === 'worker' && ![180, 600].includes(interval)) {
    throw new Error('worker telemetry samples require a 180 or 600 second interval');
  }

  return withTransaction(async (client) => {
    let saved = 0;
    for (const device of devices) {
      const vendorDeviceId = cleanText(device?.id, 160);
      if (!vendorDeviceId) continue;
      const telemetry = safeObject(device.telemetry);
      const input = safeObject(device.input);
      const output = safeObject(device.output);
      if (!Object.keys(telemetry).length && !Object.keys(input).length && !Object.keys(output).length) continue;
      const recordedAt = sourceDate(device.recordedAt ?? telemetry.timestamp ?? telemetry.recordedAt ?? telemetry.updateTime);

      await client.query(
        `INSERT INTO vendor_device_telemetry (
           vendor_account_id, vendor_device_id, vendor_device_name, captured_at,
           sample_source, sample_interval_seconds,
           source_recorded_at, cabin_temp_c, humidity_pct, real_time_weight_kg,
           operating_status_code, daily_input_t, weekly_input_t, monthly_input_t,
           yearly_input_t, daily_output_t, weekly_output_t, monthly_output_t,
           yearly_output_t, telemetry, input_data, output_data
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
         )
         ON CONFLICT (vendor_account_id, vendor_device_id, captured_at) DO UPDATE SET
           vendor_device_name = EXCLUDED.vendor_device_name,
           sample_source = EXCLUDED.sample_source,
           sample_interval_seconds = EXCLUDED.sample_interval_seconds,
           source_recorded_at = COALESCE(EXCLUDED.source_recorded_at, vendor_device_telemetry.source_recorded_at),
           cabin_temp_c = EXCLUDED.cabin_temp_c,
           humidity_pct = EXCLUDED.humidity_pct,
           real_time_weight_kg = EXCLUDED.real_time_weight_kg,
           operating_status_code = EXCLUDED.operating_status_code,
           daily_input_t = EXCLUDED.daily_input_t,
           weekly_input_t = EXCLUDED.weekly_input_t,
           monthly_input_t = EXCLUDED.monthly_input_t,
           yearly_input_t = EXCLUDED.yearly_input_t,
           daily_output_t = EXCLUDED.daily_output_t,
           weekly_output_t = EXCLUDED.weekly_output_t,
           monthly_output_t = EXCLUDED.monthly_output_t,
           yearly_output_t = EXCLUDED.yearly_output_t,
           telemetry = EXCLUDED.telemetry,
           input_data = EXCLUDED.input_data,
           output_data = EXCLUDED.output_data`,
        [
          accountId,
          vendorDeviceId,
          cleanText(device.deviceName ?? device.name),
          roundedCapture,
          source,
          interval,
          recordedAt,
          finiteNumber(telemetry.CabinTemp ?? telemetry.cabinTemp),
          finiteNumber(telemetry.Humidity ?? telemetry.humidity),
          finiteNumber(telemetry.RealTimeWeight ?? telemetry.realTimeWeight),
          finiteNumber(telemetry.OperatingStatus ?? telemetry.operatingStatus),
          finiteNumber(input.dailyInput),
          finiteNumber(input.weeklyInput),
          finiteNumber(input.monthlyInput),
          finiteNumber(input.yearlyInput),
          finiteNumber(output.dailyOutput),
          finiteNumber(output.weeklyOutput),
          finiteNumber(output.monthlyOutput),
          finiteNumber(output.yearlyOutput),
          JSON.stringify(telemetry),
          JSON.stringify(input),
          JSON.stringify(output),
        ]
      );
      saved += 1;
    }
    return saved;
  });
}

export async function loadVendorTelemetrySamples({
  vendorAccountId,
  includeAllAccounts = false,
  deviceIds = null,
  start,
  end,
  page = 1,
  pageSize = 30,
} = {}) {
  if (Array.isArray(deviceIds) && !deviceIds.length) {
    return { items: [], total: 0, page, pageSize, totalPages: 0 };
  }
  if (!start || !end) throw new Error('raw telemetry start and end dates are required');

  const params = [start, end];
  const where = [
    `sample_source = 'worker'`,
    `captured_at >= ($1::timestamp AT TIME ZONE 'Asia/Hong_Kong')`,
    `captured_at < ($2::timestamp AT TIME ZONE 'Asia/Hong_Kong')`,
  ];
  if (!includeAllAccounts) {
    params.push(String(vendorAccountId));
    where.push(`vendor_account_id = $${params.length}`);
  }
  if (Array.isArray(deviceIds)) {
    params.push(deviceIds);
    where.push(`vendor_device_id = ANY($${params.length}::text[])`);
  }
  params.push(pageSize, (page - 1) * pageSize);
  const limitParam = params.length - 1;
  const offsetParam = params.length;

  const { rows } = await query(
    `SELECT id, vendor_account_id, vendor_device_id, vendor_device_name,
            captured_at, source_recorded_at, sample_interval_seconds,
            cabin_temp_c, humidity_pct, real_time_weight_kg, operating_status_code,
            daily_input_t, weekly_input_t, monthly_input_t, yearly_input_t,
            daily_output_t, weekly_output_t, monthly_output_t, yearly_output_t,
            telemetry, input_data, output_data,
            count(*) OVER()::bigint AS total_count
       FROM vendor_device_telemetry
      WHERE ${where.join(' AND ')}
      ORDER BY captured_at DESC, vendor_device_id ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  const total = rows.length ? Number(rows[0].total_count) : 0;
  return {
    items: rows.map((row) => ({
      id: String(row.id),
      vendorAccountId: row.vendor_account_id,
      deviceId: row.vendor_device_id,
      deviceName: row.vendor_device_name,
      recordedAt: row.captured_at,
      capturedAt: row.captured_at,
      sourceRecordedAt: row.source_recorded_at,
      sampleIntervalSeconds: row.sample_interval_seconds,
      telemetry: row.telemetry || {},
      input: row.input_data || {},
      output: row.output_data || {},
      normalized: {
        cabinTempC: row.cabin_temp_c,
        humidityPct: row.humidity_pct,
        realTimeWeightKg: row.real_time_weight_kg,
        operatingStatusCode: row.operating_status_code,
        dailyInputT: row.daily_input_t,
        weeklyInputT: row.weekly_input_t,
        monthlyInputT: row.monthly_input_t,
        yearlyInputT: row.yearly_input_t,
        dailyOutputT: row.daily_output_t,
        weeklyOutputT: row.weekly_output_t,
        monthlyOutputT: row.monthly_output_t,
        yearlyOutputT: row.yearly_output_t,
      },
    })),
    total,
    page,
    pageSize,
    totalPages: total ? Math.ceil(total / pageSize) : 0,
  };
}

export async function loadLatestVendorTelemetrySnapshots({
  vendorAccountId,
  deviceIds = null,
} = {}) {
  if (!vendorAccountId) return new Map();
  const params = [String(vendorAccountId)];
  let deviceClause = '';
  if (Array.isArray(deviceIds)) {
    if (!deviceIds.length) return new Map();
    params.push(deviceIds);
    deviceClause = ` AND vendor_device_id = ANY($${params.length}::text[])`;
  }
  const { rows } = await query(
    `SELECT DISTINCT ON (vendor_device_id)
            vendor_device_id, vendor_device_name, captured_at, source_recorded_at,
            cabin_temp_c, humidity_pct, real_time_weight_kg, operating_status_code,
            telemetry, input_data, output_data
       FROM vendor_device_telemetry
      WHERE vendor_account_id = $1
        AND (cabin_temp_c IS NOT NULL OR humidity_pct IS NOT NULL OR real_time_weight_kg IS NOT NULL)
        ${deviceClause}
      ORDER BY vendor_device_id ASC, captured_at DESC`,
    params
  );
  return new Map(rows.map((row) => [String(row.vendor_device_id), {
    deviceId: String(row.vendor_device_id),
    deviceName: row.vendor_device_name,
    capturedAt: row.captured_at,
    recordedAt: row.source_recorded_at,
    telemetry: row.telemetry || {},
    input: row.input_data || {},
    output: row.output_data || {},
    normalized: {
      cabinTempC: row.cabin_temp_c,
      humidityPct: row.humidity_pct,
      realTimeWeightKg: row.real_time_weight_kg,
      operatingStatusCode: row.operating_status_code,
    },
  }]));
}

export async function resolveVendorDeviceIds({ clientId, machineId } = {}) {
  if (!clientId && !machineId) return null;
  const params = [];
  const clauses = [];
  if (machineId) {
    params.push(String(machineId));
    clauses.push(`(m.vendor_device_id = $${params.length} OR m.id::text = $${params.length} OR m.device_id = $${params.length} OR m.serial = $${params.length})`);
  }
  if (clientId) {
    params.push(String(clientId));
    clauses.push(`(c.id::text = $${params.length} OR lower(c.name) = lower($${params.length}))`);
  }
  const { rows } = await query(
    `SELECT DISTINCT m.vendor_device_id
       FROM machines m
       LEFT JOIN clients c ON c.id = m.client_id
      WHERE m.vendor_device_id IS NOT NULL
        AND ${clauses.join(' AND ')}`,
    params
  );
  return rows.map((row) => row.vendor_device_id);
}

export async function loadVendorTelemetrySummaries({
  vendorAccountId,
  includeAllAccounts = false,
  deviceIds = null,
  start,
  end,
  groupBy = 'day',
} = {}) {
  if (Array.isArray(deviceIds) && !deviceIds.length) return [];
  const params = [start, end];
  const where = [`captured_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Hong_Kong')`, `captured_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Hong_Kong')`];

  // Parameters 1 and 2 are the Hong Kong date boundaries.


  if (!includeAllAccounts) {
    params.push(vendorAccountId);
    where.push(`vendor_account_id = $${params.length}`);
  }
  if (Array.isArray(deviceIds)) {
    params.push(deviceIds);
    where.push(`vendor_device_id = ANY($${params.length}::text[])`);
  }

  const bucketExpression = groupBy === 'hour'
    ? `to_char(captured_at AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:00')`
    : `to_char(captured_at AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD')`;

  const { rows } = await query(
    `SELECT
       ${bucketExpression} AS bucket_key,
       vendor_device_id,
       max(daily_input_t) AS daily_input_t,
       max(monthly_input_t) AS monthly_input_t,
       max(yearly_input_t) AS yearly_input_t,
       bool_or(operating_status_code = 1) AS had_standby,
       avg(cabin_temp_c) AS cabin_temp_c,
       avg(humidity_pct) AS humidity_pct,
       count(*)::bigint AS sample_count
     FROM vendor_device_telemetry
     WHERE ${where.join(' AND ')}
     GROUP BY bucket_key, vendor_device_id
     ORDER BY bucket_key ASC, vendor_device_id ASC`,
    params
  );

  return rows.map((row) => ({
    capturedAt: row.bucket_key.includes(' ')
      ? `${row.bucket_key}:00+08:00`
      : `${row.bucket_key}T12:00:00+08:00`,
    deviceId: row.vendor_device_id,
    dailyInputT: row.daily_input_t,
    monthlyInputT: row.monthly_input_t,
    yearlyInputT: row.yearly_input_t,
    operatingStatusCode: row.had_standby ? 1 : 0,
    cabinTempC: row.cabin_temp_c,
    humidityPct: row.humidity_pct,
    sampleCount: row.sample_count,
  }));
}

export async function resolveReportRegion({ clientId } = {}) {
  if (clientId) {
    const { rows } = await query(
      `SELECT region FROM clients WHERE id::text = $1 OR lower(name) = lower($1) LIMIT 1`,
      [String(clientId)]
    );
    const region = rows[0]?.region;
    if (region) return region;
  }
  const { rows } = await query('SELECT default_region FROM system_settings WHERE id = 1');
  return rows[0]?.default_region || 'non-hk';
}
