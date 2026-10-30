let graphPeriods = { foodWaste:'monthly', ghg:'monthly', temp:'monthly', energy:'monthly' };
let graphFilters = { client:'', machine:'', start:'', end:'' };
let graphFilterMessage = '';
let graphApiData = null;
let graphApiKey = '';
let graphApiRequestKey = '';
let graphApiError = '';
let graphApiFailedKey = '';
let graphApiLoading = false;
let graphClientInstanceSequence = 0;

function graphNormalizePeriod(period){
  return period === 'daily' || period === 'yearly' ? period : 'monthly';
}

function graphPeriodLabel(period){
  const normalized = graphNormalizePeriod(period);
  return normalized === 'daily' ? 'Daily' : normalized === 'yearly' ? 'Yearly' : 'Monthly';
}

function graphEscape(value){
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function graphPad(value){
  return String(value).padStart(2, '0');
}

function graphTodayKey(){
  if(window.BSF_METRICS && typeof window.BSF_METRICS.hongKongDateKey === 'function'){
    return window.BSF_METRICS.hongKongDateKey(new Date());
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Hong_Kong', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(new Date());
  const values = {};
  parts.forEach(function(part){ if(part.type !== 'literal') values[part.type] = part.value; });
  return values.year + '-' + values.month + '-' + values.day;
}

function graphAnchorDate(){
  const today = graphTodayKey();
  const candidate = String(graphFilters.end || graphFilters.start || today).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : today;
}

function ensureGraphDateFilters(){
  const today = graphTodayKey();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const period = graphNormalizePeriod(graphPeriods.foodWaste);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const defaults = period === 'daily'
    ? { start:today, end:today }
    : period === 'yearly'
      ? { start:year + '-01-01', end:year + '-12-31' }
      : { start:year + '-' + graphPad(month) + '-01', end:year + '-' + graphPad(month) + '-' + graphPad(lastDay) };
  if(!graphFilters.start || !/^\d{4}-\d{2}-\d{2}$/.test(graphFilters.start)) graphFilters.start = defaults.start;
  if(!graphFilters.end || !/^\d{4}-\d{2}-\d{2}$/.test(graphFilters.end)) graphFilters.end = defaults.end;
  if(graphFilters.start > graphFilters.end) graphFilters.end = graphFilters.start;
  if(period === 'daily') graphFilters.end = graphFilters.start;
}

function graphPeriodRange(){
  ensureGraphDateFilters();
  return {
    start:graphFilters.start,
    end:graphFilters.end,
    year:Number(graphFilters.end.slice(0, 4)),
    month:Number(graphFilters.end.slice(5, 7))
  };
}

function graphPeriodRangeForFilters(){
  const anchor = graphAnchorDate();
  const arbitraryStart = graphFilters.start;
  const arbitraryEnd = graphFilters.end;
  const range = graphPeriodRange();
  return Object.assign({}, range, { filterStart:arbitraryStart, filterEnd:arbitraryEnd, anchor:anchor });
}

function graphClientOptions(){
  return scopedClientNames().sort();
}

function graphMachineOptions(){
  return scopedDevices().filter(function(device){
    if(graphFilters.client && device.client !== graphFilters.client) return false;
    return true;
  }).sort(function(left, right){ return String(left.id).localeCompare(String(right.id)); });
}

function graphRequestKey(){
  const range = graphPeriodRange();
  return [graphPeriods.foodWaste, range.start, range.end, graphFilters.client, graphFilters.machine].join('|');
}

function graphApiParams(){
  const range = graphPeriodRange();
  const params = {
    period:graphPeriods.foodWaste,
    clientId:graphFilters.client || undefined,
    machineId:graphFilters.machine || undefined,
    start:range.start,
    end:range.end,
    year:range.year,
    month:range.month
  };
  if(graphPeriods.foodWaste === 'daily') params.date = range.start;
  return params;
}

function graphQueryString(params){
  const pairs = [];
  Object.keys(params || {}).forEach(function(key){
    const value = params[key];
    if(value !== undefined && value !== null && value !== '') pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
  });
  return pairs.length ? '?' + pairs.join('&') : '';
}

function graphClientInstanceId(){
  try {
    const key = 'bsf.graph.clientInstance';
    let value = sessionStorage.getItem(key);
    if(!value){
      graphClientInstanceSequence += 1;
      value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : String(Date.now()) + '-' + graphClientInstanceSequence;
      sessionStorage.setItem(key, value);
    }
    return value;
  } catch(error) {
    return 'unavailable';
  }
}

async function graphFetchJson(path, params){
  let lastError = null;
  let refreshAttempted = false;
  for(let attempt = 0; attempt < 3; attempt += 1){
    try {
      const response = await fetch(path + graphQueryString(params), {
        method:'GET',
        credentials:'include',
        headers:{ Accept:'application/json', 'X-BSF-Client-Instance':graphClientInstanceId() }
      });
      const payload = await response.json().catch(function(){ return {}; });
      if(!response.ok){
        const apiError = payload && payload.error ? payload.error : {};
        const error = new Error(apiError.message || payload.message || ('HTTP ' + response.status));
        error.code = apiError.code || response.status;
        error.status = response.status;
        throw error;
      }
      return payload && payload.ok === true && payload.data ? payload.data : payload;
    } catch(error) {
      lastError = error;
      const code = String(error && (error.code || error.status) || '');
      if(code === 'VENDOR_SESSION_EXPIRED' && !refreshAttempted
        && window.BSF_API && typeof window.BSF_API.refreshSession === 'function'){
        refreshAttempted = true;
        await window.BSF_API.refreshSession();
        continue;
      }
      const retryable = code === 'NETWORK_ERROR'
        || code === 'TIMEOUT'
        || code === '429'
        || code === '502'
        || code === '503'
        || code === '504'
        || /^5\d\d$/.test(code)
        || (!code && error && error.name === 'TypeError');
      if(!retryable || attempt === 2) throw error;
      await new Promise(function(resolve){ setTimeout(resolve, attempt === 0 ? 500 : 1500); });
    }
  }
  throw lastError || new Error('Chart data could not be loaded');
}

function graphEmptySeries(){
  return [];
}

function graphSeries(name){
  return graphApiData && Array.isArray(graphApiData[name]) ? graphApiData[name] : graphEmptySeries();
}

function graphSeriesValidCount(rows, key){
  return (rows || []).filter(function(row){
    const value = row && row[key];
    return value !== null && value !== undefined && Number.isFinite(Number(value));
  }).length;
}

function graphErrorMessage(error){
  const code = error && error.code ? String(error.code) : '';
  if(code === 'VENDOR_ACCOUNT_SCOPE_REQUIRED'){
    return 'This account is not linked to a client or machine. Please contact an administrator.';
  }
  if(code === 'VENDOR_SESSION_EXPIRED' || code === 'UNAUTHORIZED'){
    return 'Your session has expired. Please sign in again.';
  }
  if(code === 'NETWORK_ERROR' || code === 'BACKEND_UNAVAILABLE' || code === '429' || code === '503'){
    return 'Chart data service is unavailable. Please try again.';
  }
  return error && error.message ? error.message : 'Chart data could not be loaded';
}

function graphStatusMarkup(){
  let text = '';
  let color = '#64748b';
  if(graphApiLoading){
    text = 'Loading chart data...';
  } else if(graphApiError){
    text = graphApiError;
    color = '#f59e0b';
  } else if(graphApiData && graphApiKey === graphRequestKey()){
    const count = Number(graphApiData.summary && graphApiData.summary.pointCount) || 0;
    text = count ? count + ' data point' + (count === 1 ? '' : 's') + ' loaded' : 'No data for the selected period';
  }
  return '<p id="graph-data-status" role="status" style="min-height:18px;margin:-4px 0 12px;color:' + color + ';font-size:12px;">' + graphEscape(text) + '</p>';
}

function graphPeriodFilterMarkup(){
  const options = ['daily','monthly','yearly'].map(function(period){
    return '<option value="' + period + '"' + (graphPeriods.foodWaste === period ? ' selected' : '') + '>' + graphPeriodLabel(period) + '</option>';
  }).join('');
  return '<div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
    '<label style="display:flex;align-items:center;gap:8px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Period Filter' +
    '<select id="graph-period-filter" onchange="setGraphPeriod(this.value)" style="padding:8px 12px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:13px;cursor:pointer;">' + options + '</select></label></div>';
}

function graphRowLabel(row, index){
  return String(row && (row.label || row.date) || String(index + 1));
}

function graphXAxisLabel(value){
  const text = String(value || '');
  const dateTime = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if(dateTime) return dateTime[2];
  const date = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(date) return date[3];
  const month = text.match(/^(\d{4})-(\d{2})$/);
  if(month){
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[Number(month[2]) - 1] || text;
  }
  return text;
}

function graphXAxisIndices(length, maxLabels){
  if(!length) return [];
  if(length <= maxLabels) return Array.from({ length:length }, function(_, index){ return index; });
  const indices = [];
  for(let index = 0; index < maxLabels; index += 1){
    indices.push(Math.round(index * (length - 1) / (maxLabels - 1)));
  }
  return Array.from(new Set(indices));
}

function graphAxisScale(values){
  const numbers = (values || []).filter(function(value){ return Number.isFinite(value); });
  if(!numbers.length) return { min:0, max:1, step:0.25, ticks:[0, 0.25, 0.5, 0.75, 1] };
  let min = Math.min.apply(null, numbers);
  let max = Math.max.apply(null, numbers);
  if(min === max){
    if(min === 0) return { min:0, max:1, step:0.25, ticks:[0, 0.25, 0.5, 0.75, 1] };
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    min -= padding;
    max += padding;
  }
  const roughStep = (max - min) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const axisMin = Math.floor(min / step) * step;
  const axisMax = Math.ceil(max / step) * step;
  const ticks = [];
  for(let value = axisMin; value <= axisMax + step * 0.000001; value += step){
    ticks.push(Math.abs(value) < step * 0.000001 ? 0 : value);
  }
  return { min:axisMin, max:axisMax, step:step, ticks:ticks };
}

function graphAxisLabel(value, step){
  if(value === 0) return '0';
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return Number(value).toFixed(decimals);
}

function buildLineChartSvg(rows, valueKey, color){
  const data = (Array.isArray(rows) ? rows : []).map(function(row, index){
    const raw = row && row[valueKey];
    const value = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    return { label:graphRowLabel(row, index), value:Number.isFinite(value) ? value : null, index:index };
  });
  const valid = data.filter(function(row){ return row.value !== null; });
  if(!valid.length){
    return '<div style="height:180px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:13px;">No data for the selected period</div>';
  }

  const width = 1000, height = 180, left = 68, right = 20, top = 16, bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const scale = graphAxisScale(valid.map(function(row){ return row.value; }));
  const range = scale.max - scale.min;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const points = data.map(function(row){
    if(row.value === null) return null;
    return {
      x:left + step * row.index,
      y:top + plotHeight - ((row.value - scale.min) / range) * plotHeight,
      label:row.label,
      value:row.value,
      index:row.index
    };
  });

  const segments = [];
  let current = '';
  points.forEach(function(point){
    if(!point){
      if(current) segments.push(current);
      current = '';
      return;
    }
    current += (current ? ' L ' : ' M ') + point.x.toFixed(1) + ' ' + point.y.toFixed(1);
    if(!points[point.index + 1]) {
      segments.push(current);
      current = '';
    }
  });
  const paths = segments.map(function(segment){
    return '<path d="' + segment + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>';
  }).join('');
  const dots = points.filter(Boolean).map(function(point){
    return '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="3.5" fill="' + color + '"><title>' + graphEscape(point.label) + ': ' + point.value.toFixed(1) + '</title></circle>';
  }).join('');
  const xAxisIndices = new Set(graphXAxisIndices(data.length, 7));
  const labels = data.map(function(row, index){
    if(!xAxisIndices.has(index)) return '';
    const x = left + step * index;
    return '<text data-x-axis-label="true" x="' + x.toFixed(1) + '" y="' + (height - 8) + '" text-anchor="middle" fill="#64748b" font-size="11">' + graphEscape(graphXAxisLabel(row.label)) + '</text>';
  }).join('');
  const yAxis = scale.ticks.map(function(value){
    const y = top + plotHeight - ((value - scale.min) / range) * plotHeight;
    const isZero = value === 0;
    return '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (left + plotWidth) + '" y2="' + y.toFixed(1) + '" stroke="' + (isZero ? '#64748b' : '#334155') + '" stroke-width="1" />' +
      '<text data-axis-label="true" x="' + (left - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" fill="#94a3b8" font-size="10">' + graphAxisLabel(value, scale.step) + '</text>';
  }).join('');
  const grid = yAxis +
    '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (top + plotHeight) + '" stroke="#334155" stroke-width="1" />';
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" style="width:100%;height:180px;display:block;" role="img" aria-label="Line chart">' + grid + paths + dots + labels + '</svg>';
}

function graphChartTitle(kind){
  const period = graphPeriodLabel(graphPeriods.foodWaste);
  if(kind === 'foodWaste') return period + ' Food Waste In (KG)';
  if(kind === 'ghg') return period + ' GHG Reduced (KG CO₂e)';
  if(kind === 'temp') return period + ' Container Temperature (°C)';
  if(kind === 'energy') return period + ' Energy Consumed (kWh)';
  return period + ' Trend';
}

function graphChartMarkup(title, rows, valueKey, color, unit){
  const valid = (rows || []).map(function(row){ return row && row[valueKey]; }).filter(function(value){
    return value !== null && value !== undefined && Number.isFinite(Number(value));
  }).map(Number);
  const average = valid.length ? valid.reduce(function(sum, value){ return sum + value; }, 0) / valid.length : null;
  return '<div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:16px;">' +
    '<div style="margin-bottom:16px;"><h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0;text-transform:uppercase;letter-spacing:0.5px;">' + graphEscape(title) + '</h3></div>' +
    buildLineChartSvg(rows, valueKey, color) +
    '<div style="display:flex;justify-content:space-between;margin-top:8px;gap:12px;flex-wrap:wrap;"><span style="font-size:12px;color:#64748b;">Unit: ' + graphEscape(unit) + '</span><span style="font-size:12px;color:#64748b;">Avg: ' + (average === null ? '—' : average.toFixed(1)) + ' ' + graphEscape(unit) + '</span></div></div>';
}

async function loadGraphApiData(){
  const key = graphRequestKey();
  if(graphApiData && graphApiKey === key) return;
  if(graphApiFailedKey === key) return;
  if(graphApiLoading && graphApiRequestKey === key) return;
  graphApiLoading = true;
  graphApiRequestKey = key;
  graphApiError = '';
  const status = document.getElementById('graph-data-status');
  if(status) status.textContent = 'Loading chart data...';
  try {
    const data = await graphFetchJson('/api/v1/graphs', graphApiParams());
    if(key !== graphRequestKey()) return;
    graphApiData = data && typeof data === 'object' && !Array.isArray(data) ? data : { items:[], ghgItems:[], energyItems:[], tempItems:[], humidityItems:[] };
    graphApiKey = key;
    graphApiFailedKey = '';
  } catch(error) {
    if(key !== graphRequestKey()) return;
    graphApiData = null;
    graphApiKey = '';
    graphApiError = graphErrorMessage(error);
    graphApiFailedKey = key;
  } finally {
    if(graphApiRequestKey === key) graphApiLoading = false;
  }
  if(currentPage === 'graphs' && graphRequestKey() === key){
    renderGraphs(document.getElementById('page-content'));
  }
}

function setGraphPeriod(period){
  const normalized = graphNormalizePeriod(period);
  Object.keys(graphPeriods).forEach(function(key){ graphPeriods[key] = normalized; });
  graphApiData = null;
  graphApiKey = '';
  graphApiError = '';
  if(normalized === 'daily'){
    graphFilters.end = graphFilters.start || graphFilters.end || graphTodayKey();
    graphFilters.start = graphFilters.end;
  }
  graphFilterMessage = '';
  renderGraphs(document.getElementById('page-content'));
}

function graphSetClient(client){
  graphFilters.client = client || '';
  graphFilters.machine = '';
  graphApiData = null;
  graphApiKey = '';
  graphFilterMessage = '';
  renderGraphs(document.getElementById('page-content'));
}

function graphSetMachine(machine){
  graphFilters.machine = machine || '';
  graphApiData = null;
  graphApiKey = '';
  graphFilterMessage = '';
  renderGraphs(document.getElementById('page-content'));
}

function graphSetStartDate(value){
  const next = value || '';
  const end = graphFilters.end || next;
  if(next && end && next > end){
    graphFilterMessage = 'Start date cannot be later than end date.';
    graphFilters.start = end;
  } else {
    graphFilters.start = next;
    graphFilterMessage = '';
  }
  if(graphPeriods.foodWaste === 'daily' && graphFilters.start) graphFilters.end = graphFilters.start;
  graphApiData = null;
  graphApiKey = '';
  renderGraphs(document.getElementById('page-content'));
}

function graphSetEndDate(value){
  const next = value || '';
  const start = graphFilters.start || next;
  if(next && start && next < start){
    graphFilterMessage = 'End date cannot be earlier than start date.';
    graphFilters.end = start;
  } else {
    graphFilters.end = next;
    graphFilterMessage = '';
  }
  if(graphPeriods.foodWaste === 'daily' && graphFilters.end) graphFilters.start = graphFilters.end;
  graphApiData = null;
  graphApiKey = '';
  renderGraphs(document.getElementById('page-content'));
}

function applyGraphFilters(){
  if(graphFilters.start && graphFilters.end && graphFilters.start > graphFilters.end){
    graphFilterMessage = 'Start date cannot be later than end date.';
    renderGraphs(document.getElementById('page-content'));
    return;
  }
  if(graphPeriods.foodWaste === 'daily' && graphFilters.start !== graphFilters.end){
    graphFilterMessage = 'Daily view requires the same start and end date.';
    renderGraphs(document.getElementById('page-content'));
    return;
  }
  graphFilterMessage = '';
  graphApiData = null;
  graphApiKey = '';
  renderGraphs(document.getElementById('page-content'));
}

function retryGraphData(){
  graphApiData = null;
  graphApiKey = '';
  graphApiError = '';
  graphApiFailedKey = '';
  renderGraphs(document.getElementById('page-content'));
}

function renderGraphs(container){
  ensureGraphDateFilters();
  const clientScoped = isClientScopedRole();
  const clientOptions = clientScoped ? [] : ['<option value="">All Clients</option>'].concat(graphClientOptions().map(function(client){
    return '<option value="' + graphEscape(client) + '"' + (graphFilters.client === client ? ' selected' : '') + '>' + graphEscape(client) + '</option>';
  }));
  const machineOptions = isUserRole() ? [] : ['<option value="">All Machines</option>'].concat(graphMachineOptions().map(function(device){
    return '<option value="' + graphEscape(device.id) + '"' + (graphFilters.machine === device.id ? ' selected' : '') + '>' + graphEscape(device.id) + '</option>';
  }));

  const foodWaste = graphSeries('items');
  const ghg = graphSeries('ghgItems');
  const temperature = graphSeries('tempItems');
  const energy = graphSeries('energyItems');
  const retry = graphApiError ? ' <button onclick="retryGraphData()" style="margin-left:8px;padding:2px 8px;background:#334155;border:1px solid #475569;border-radius:5px;color:#e2e8f0;cursor:pointer;font-size:11px;">Retry</button>' : '';

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Data Analytics</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Visualize real vendor data across food waste, carbon reduction, temperature and energy</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">
      ${clientScoped ? clientScopeBadge() : '<label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Client Filter<select id="graph-client-filter" onchange="graphSetClient(this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:190px;">' + clientOptions.join('') + '</select></label>'}
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Machine<select id="graph-machine-filter" ${isUserRole()?'disabled':''} onchange="graphSetMachine(this.value)" style="padding:10px 16px;background:${isUserRole()?'#111827':'#1e293b'};border:1px solid #334155;border-radius:8px;color:${isUserRole()?'#94a3b8':'#e2e8f0'};font-size:14px;min-width:190px;cursor:${isUserRole()?'not-allowed':'pointer'};">${machineOptions.join('')}</select></label>
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Start Date<input id="graph-start-date" type="date" value="${graphEscape(graphFilters.start)}" max="${graphEscape(graphFilters.end)}" onchange="graphSetStartDate(this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></label>
      <span style="color:#64748b;display:flex;align-items:center;padding-bottom:11px;">to</span>
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">End Date<input id="graph-end-date" type="date" value="${graphEscape(graphFilters.end)}" min="${graphEscape(graphFilters.start)}" onchange="graphSetEndDate(this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></label>
      <button onclick="applyGraphFilters()" style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Apply</button>
    </div>
    <p id="graph-date-validation" role="alert" style="min-height:18px;margin:0 0 12px;color:${graphFilterMessage ? '#f59e0b' : 'transparent'};font-size:12px;">${graphEscape(graphFilterMessage || '.')}</p>
    ${graphStatusMarkup().replace('</p>', retry + '</p>')}
    ${graphPeriodFilterMarkup()}
    ${graphChartMarkup(graphChartTitle('foodWaste'), foodWaste, 'value', '#3b82f6', 'KG')}
    ${graphChartMarkup(graphChartTitle('ghg'), ghg, 'value', '#10b981', 'kg CO₂e')}
    ${currentRole === 'admin'
      ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' + graphChartMarkup(graphChartTitle('temp'), temperature, 'value', '#f97316', '°C') + graphChartMarkup(graphChartTitle('energy'), energy, 'value', '#ef4444', 'kWh') + '</div>'
      : graphChartMarkup(graphChartTitle('temp'), temperature, 'value', '#f97316', '°C')}
  `;
  loadGraphApiData();
}
