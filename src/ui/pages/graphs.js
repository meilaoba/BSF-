let graphPeriods = { foodWaste:'monthly', ghg:'monthly', temp:'monthly', energy:'monthly' };
let graphFilters = { client:'', machine:'', start:'', end:'' };
let graphFilterMessage = '';
let foodWasteData = [];

function graphPeriodLabel(period){
  return period === 'daily' ? 'Daily' : period === 'yearly' ? 'Yearly' : 'Monthly';
}

function graphNormalizePeriod(period){
  return period === 'daily' || period === 'yearly' ? period : 'monthly';
}

function graphEscape(value){
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function graphDateBounds(){
  const dates = rawDataRows.map(function(row){ return String(row.recordedAt || '').slice(0,10); }).filter(Boolean).sort();
  return { min:dates.length ? dates[0] : '', max:dates.length ? dates[dates.length - 1] : '' };
}

function ensureGraphDateFilters(){
  const bounds = graphDateBounds();
  if(!graphFilters.start) graphFilters.start = bounds.min;
  if(!graphFilters.end) graphFilters.end = bounds.max;
  if(graphFilters.start && graphFilters.end && graphFilters.start > graphFilters.end) graphFilters.end = graphFilters.start;
}

function graphFilteredRawRows(){
  ensureGraphDateFilters();
  const visibleIds = new Set(scopedDevices().map(function(device){ return device.id; }));
  return rawDataRows.filter(function(row){
    if(!visibleIds.has(row.device)) return false;
    const dateText = String(row.recordedAt || '').slice(0,10);
    if(graphFilters.start && dateText < graphFilters.start) return false;
    if(graphFilters.end && dateText > graphFilters.end) return false;
    if(graphFilters.machine && row.device !== graphFilters.machine) return false;
    if(graphFilters.client){
      const device = devices.find(function(item){ return item.id === row.device; });
      if(!device || device.client !== graphFilters.client) return false;
    }
    return true;
  }).slice(0,100);
}

function graphClientOptions(){
  return scopedClientNames().sort();
}

function graphMachineOptions(){
  return scopedDevices();
}

function graphPeriodFilterMarkup(){
  const options = ['daily','monthly','yearly'].map(function(period){
    return '<option value="' + period + '"' + (graphPeriods.foodWaste === period ? ' selected' : '') + '>' + graphPeriodLabel(period) + '</option>';
  }).join('');
  return '<div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
    '<label style="display:flex;align-items:center;gap:8px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Period Filter' +
    '<select id="graph-period-filter" onchange="setGraphPeriod(this.value)" style="padding:8px 12px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:13px;cursor:pointer;">' + options + '</select></label></div>';
}

function aggregateGraphSeries(rows, key, period){
  const groups = new Map();
  rows.forEach(function(row){
    const rawValue = row[key];
    if(rawValue === null || rawValue === undefined || !Number.isFinite(Number(rawValue))) return;
    const dateText = String(row.date || '').slice(0, 10);
    if(!dateText) return;
    const label = period === 'daily' ? dateText : period === 'monthly' ? dateText.slice(0, 7) : dateText.slice(0, 4);
    const group = groups.get(label) || { label:label, sum:0, count:0 };
    group.sum += Number(rawValue);
    group.count += 1;
    groups.set(label, group);
  });
  return Array.from(groups.values()).sort(function(a,b){ return a.label.localeCompare(b.label); }).map(function(group){
    const item = { day:group.label };
    item[key] = group.sum / group.count;
    return item;
  });
}

function buildBarChartSvg(rows, valueKey, color){
  const pointsData = rows.map(function(row, index){
    return { label: row.day || row.label || String(index + 1), value: Number(row[valueKey]) };
  }).filter(function(row){ return Number.isFinite(row.value); });
  if(!pointsData.length) return '<div style="height:180px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:13px;">No data source</div>';
  const width = 1000, height = 180, left = 44, right = 20, top = 16, bottom = 30;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maxValue = Math.max.apply(null, pointsData.map(function(row){ return row.value; }).concat([1]));
  const step = plotWidth / pointsData.length;
  const barWidth = Math.max(8, Math.min(52, step * 0.58));
  const maxBarHeight = plotHeight * 0.92;
  const bars = pointsData.map(function(row, index){
    const barHeight = Math.max(2, (row.value / maxValue) * maxBarHeight);
    const x = left + step * index + (step - barWidth) / 2;
    const y = top + plotHeight - barHeight;
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="3" fill="' + color + '"><title>' + graphEscape(row.label) + ': ' + row.value.toFixed(1) + '</title></rect>';
  }).join('');
  const labelStep = Math.max(1, Math.ceil(pointsData.length / 6));
  const labels = pointsData.map(function(row, index){
    const x = left + step * index + step / 2;
    return index % labelStep === 0 || index === pointsData.length - 1 ? '<text x="' + x.toFixed(1) + '" y="' + (height - 8) + '" text-anchor="middle" fill="#64748b" font-size="11">' + graphEscape(row.label) + '</text>' : '';
  }).join('');
  const grid = '<line x1="' + left + '" y1="' + (top + plotHeight) + '" x2="' + (left + plotWidth) + '" y2="' + (top + plotHeight) + '" stroke="#334155" stroke-width="1" />' +
    '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (top + plotHeight) + '" stroke="#334155" stroke-width="1" />';
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" style="width:100%;height:180px;display:block;">' + grid + bars + labels + '</svg>';
}

function foodWasteChartMarkup(){
  return '<div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:16px;">' +
    '<div style="margin-bottom:16px;"><h3 id="food-waste-title" style="font-size:14px;font-weight:600;color:#94a3b8;margin:0;text-transform:uppercase;letter-spacing:0.5px;">' + graphPeriodLabel(graphPeriods.foodWaste) + ' Food Waste In (KG)</h3></div>' +
    '<div id="food-waste-chart" style="height:180px;position:relative;"></div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:8px;"><span style="font-size:12px;color:#64748b;">Unit: KG</span><span id="food-waste-total" style="font-size:12px;color:#64748b;">Total: —</span></div></div>';
}

function renderFoodWasteChart(){
  const chart = document.getElementById('food-waste-chart');
  const title = document.getElementById('food-waste-title');
  const total = document.getElementById('food-waste-total');
  if(title) title.textContent = graphPeriodLabel(graphPeriods.foodWaste) + ' Food Waste In (KG)';
  if(!chart) return;
  const series = foodWasteData.map(function(row){
    return { day:row.label || row.period || row.date || '', value:Number(row.value !== undefined ? row.value : row.waste !== undefined ? row.waste : row.weight) };
  }).filter(function(row){ return row.day && Number.isFinite(row.value); });
  chart.innerHTML = buildBarChartSvg(series, 'value', '#3b82f6');
  if(total) total.textContent = series.length ? 'Total: ' + series.reduce(function(a,b){ return a + b.value; }, 0).toFixed(1) + ' KG' : 'Total: —';
}

async function loadFoodWasteChart(){
  if(!window.BSF_API || !window.BSF_API_CONFIG || !window.BSF_API_CONFIG.enabled){ foodWasteData = []; renderFoodWasteChart(); return; }
  try { const data = await window.BSF_API.getFoodWaste({period:graphPeriods.foodWaste, client:graphFilters.client, machine:graphFilters.machine, start:graphFilters.start, end:graphFilters.end}); foodWasteData = data && (data.items || data.list) ? (data.items || data.list) : (Array.isArray(data) ? data : []); }
  catch(error){ foodWasteData = []; }
  renderFoodWasteChart();
}

function setGraphPeriod(period){
  const normalized = graphNormalizePeriod(period);
  Object.keys(graphPeriods).forEach(function(key){ graphPeriods[key] = normalized; });
  renderGraphs(document.getElementById('page-content'));
}

function graphUpdateDateLimits(){
  const startInput = document.getElementById('graph-start-date');
  const endInput = document.getElementById('graph-end-date');
  if(startInput) startInput.max = graphFilters.end || '';
  if(endInput) endInput.min = graphFilters.start || '';
}

function graphSetClient(client){
  graphFilters.client = client || '';
  if(graphFilters.machine){
    const valid = devices.some(function(device){ return device.id === graphFilters.machine && (!graphFilters.client || device.client === graphFilters.client); });
    if(!valid) graphFilters.machine = '';
  }
  graphFilterMessage = '';
  renderGraphs(document.getElementById('page-content'));
}

function graphSetMachine(machine){
  graphFilters.machine = machine || '';
  graphFilterMessage = '';
}

function graphSetStartDate(value){
  graphFilterMessage = '';
  graphFilters.start = value || '';
  if(graphFilters.start && graphFilters.end && graphFilters.start > graphFilters.end){
    graphFilters.start = graphFilters.end;
    graphFilterMessage = 'Start date cannot be after end date. It has been adjusted to the end date.';
  }
  const input = document.getElementById('graph-start-date');
  if(input) input.value = graphFilters.start;
  graphUpdateDateLimits();
}

function graphSetEndDate(value){
  graphFilterMessage = '';
  graphFilters.end = value || '';
  if(graphFilters.start && graphFilters.end && graphFilters.end < graphFilters.start){
    graphFilters.end = graphFilters.start;
    graphFilterMessage = 'End date cannot be before start date. It has been adjusted to the start date.';
  }
  const input = document.getElementById('graph-end-date');
  if(input) input.value = graphFilters.end;
  graphUpdateDateLimits();
}

function applyGraphFilters(){
  const startInput = document.getElementById('graph-start-date');
  const endInput = document.getElementById('graph-end-date');
  let start = startInput ? startInput.value : graphFilters.start;
  let end = endInput ? endInput.value : graphFilters.end;
  graphFilterMessage = '';
  if(start && end && start > end){
    end = start;
    graphFilterMessage = 'Start date cannot be after end date. End date has been adjusted.';
  }
  graphFilters.start = start;
  graphFilters.end = end;
  renderGraphs(document.getElementById('page-content'));
}

function renderGraphs(container){
  ensureGraphDateFilters();
  const chartData = graphFilteredRawRows().reverse().map(function(row,i){
    return { day:i+1, date:row.recordedAt, waste:null, temp:Number(row.temperature), energy:null, ghg:null, humidity:Number(row.humidity) };
  });
  const ghgSeries = aggregateGraphSeries(chartData, 'ghg', graphPeriods.ghg);
  const tempSeries = aggregateGraphSeries(chartData, 'temp', graphPeriods.temp);
  const energySeries = aggregateGraphSeries(chartData, 'energy', graphPeriods.energy);

  function lineChart(data, key, color, unit, chartId){
    const period = graphPeriods[chartId] || graphPeriods.foodWaste;
    const validValues = data.map(function(row){ return row[key]; }).filter(function(value){ return value !== null && value !== undefined && Number.isFinite(Number(value)); }).map(Number);
    const avgValue = validValues.length ? (validValues.reduce(function(a,b){ return a+b; },0) / validValues.length).toFixed(1) : '—';
    return '<div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:16px;">' +
      '<div style="margin-bottom:16px;"><h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0;text-transform:uppercase;letter-spacing:0.5px;">' + graphPeriodLabel(period) + ' ' + key + ' Trend' + (validValues.length ? '' : ' · No data source') + '</h3></div>' +
      buildBarChartSvg(data, key, color) +
      '<div style="display:flex;justify-content:space-between;margin-top:8px;"><span style="font-size:12px;color:#64748b;">Unit: ' + unit + '</span><span style="font-size:12px;color:#64748b;">Avg: ' + avgValue + ' ' + unit + '</span></div></div>';
  }

  const clientScoped = isClientScopedRole();
  const clientOptions = (clientScoped ? [] : ['<option value="">All Clients</option>']).concat(graphClientOptions().map(function(client){
    return '<option value="' + graphEscape(client) + '"' + (graphFilters.client === client ? ' selected' : '') + '>' + graphEscape(client) + '</option>';
  })).join('');
  const machineOptions = (isUserRole() ? [] : ['<option value="">All Machines</option>']).concat(graphMachineOptions().map(function(device){
    return '<option value="' + graphEscape(device.id) + '"' + (graphFilters.machine === device.id ? ' selected' : '') + '>' + graphEscape(device.id) + '</option>';
  })).join('');

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Data Analytics</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Visualize trends across temperature, humidity, weight, energy and carbon reduction</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">
      ${clientScoped ? clientScopeBadge() : '<label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">Client Filter<select id="graph-client-filter" onchange="graphSetClient(this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:190px;">' + clientOptions + '</select></label>'}
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        Machine
        <select id="graph-machine-filter" ${isUserRole()?'disabled':''} onchange="graphSetMachine(this.value)" style="padding:10px 16px;background:${isUserRole()?'#111827':'#1e293b'};border:1px solid #334155;border-radius:8px;color:${isUserRole()?'#94a3b8':'#e2e8f0'};font-size:14px;min-width:190px;cursor:${isUserRole()?'not-allowed':'pointer'};">${machineOptions}</select>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        Start Date
        <input id="graph-start-date" type="date" value="${graphFilters.start}" max="${graphFilters.end}" onchange="graphSetStartDate(this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      </label>
      <span style="color:#64748b;display:flex;align-items:center;padding-bottom:11px;">to</span>
      <label style="display:flex;flex-direction:column;gap:6px;color:#94a3b8;font-size:12px;font-weight:600;">
        End Date
        <input id="graph-end-date" type="date" value="${graphFilters.end}" min="${graphFilters.start}" onchange="graphSetEndDate(this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      </label>
      <button onclick="applyGraphFilters()" style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Apply</button>
    </div>
    <p id="graph-date-validation" style="min-height:18px;margin:0 0 12px;color:${graphFilterMessage ? '#f59e0b' : 'transparent'};font-size:12px;">${graphFilterMessage || '.'}</p>
    ${graphPeriodFilterMarkup()}
    ${foodWasteChartMarkup()}
    ${lineChart(ghgSeries, 'ghg', '#10b981', 'kg CO₂e', 'ghg')}
    ${currentRole === 'admin'
      ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' + lineChart(tempSeries, 'temp', '#f97316', '°C', 'temp') + lineChart(energySeries, 'energy', '#ef4444', 'kWh', 'energy') + '</div>'
      : lineChart(tempSeries, 'temp', '#f97316', '°C', 'temp')}
  `;
  loadFoodWasteChart();
}
