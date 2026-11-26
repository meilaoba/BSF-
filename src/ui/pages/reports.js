let reportFilters = { client:'', device:'', period:'monthly', month:new Date().getMonth()+1, year:new Date().getFullYear() };
let reportFoodWasteData = [];
let reportYearManuallySelected = false;
let reportApiData = null;
let reportApiKey = '';
let reportApiRequestKey = '';
let reportApiRequestPromise = null;

function syncReportCalendarYear(){
  const currentYear = new Date().getFullYear();
  if(!reportYearManuallySelected && Number(reportFilters.year) !== currentYear){
    reportFilters.year = currentYear;
    return true;
  }
  return false;
}

function reportPeriodTitle(){
  return reportFilters.period === 'yearly' ? 'Yearly' : 'Monthly';
}

function reportExcelChartTitle(){
  if(reportFilters.period === 'yearly'){
    return String(Number(reportFilters.year) || new Date().getFullYear());
  }
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = Math.min(12, Math.max(1, Number(reportFilters.month) || 1));
  return monthNames[month - 1];
}

function reportWeightChartTitle(){
  return reportFilters.period === 'monthly' ? 'Daily Waste-in (KG)' : 'Monthly Waste-in (KG)';
}

function reportTemperatureChartTitle(){
  return reportFilters.period === 'monthly' ? 'Daily Average Temperature (°C)' : 'Monthly Average Temperature (°C)';
}

function reportHumidityChartTitle(){
  return reportFilters.period === 'monthly' ? 'Daily Average Humidity (%)' : 'Monthly Average Humidity (%)';
}

function reportEnergyDisplay(metrics){
  const raw = metrics && metrics.energyKwh;
  if(raw === null || raw === undefined) return { label:'Energy Consumed', value:null };
  const value = Number(raw);
  return {
    label:Number.isFinite(value) && value < 0 ? 'Solar Energy Credit' : 'Energy Consumed',
    value:Number.isFinite(value) ? Math.abs(value) : null
  };
}

function reportPad(value){
  return String(value).padStart(2, '0');
}

function reportPeriodRange(){
  if(window.BSF_METRICS && typeof window.BSF_METRICS.periodRange === 'function'){
    const range = window.BSF_METRICS.periodRange({
      period:reportFilters.period,
      year:reportFilters.year,
      month:reportFilters.month,
      now:new Date()
    });
    return { start:range.start, end:range.end };
  }
  const year = Number(reportFilters.year) || new Date().getFullYear();
  if(reportFilters.period === 'yearly') return { start:year + '-01-01', end:year + '-12-31' };
  const month = Math.min(12, Math.max(1, Number(reportFilters.month) || 1));
  const lastDay = new Date(year, month, 0).getDate();
  const monthText = reportPad(month);
  return { start:year + '-' + monthText + '-01', end:year + '-' + monthText + '-' + reportPad(lastDay) };
}

function reportPdfEndDate(range, now = new Date()){
  const today = window.BSF_METRICS && typeof window.BSF_METRICS.hongKongDateKey === 'function'
    ? window.BSF_METRICS.hongKongDateKey(now)
    : now.toISOString().slice(0, 10);
  if(range.end <= today) return range.end;
  if(range.start > today) return range.start;
  return today;
}

function reportRowsThroughDate(rows, endDate){
  return (Array.isArray(rows) ? rows : []).filter(function(row){
    const label = String(row && (row.label || row.date) || '');
    if(reportFilters.period === 'yearly') return label.slice(0, 7) <= String(endDate).slice(0, 7);
    return label.slice(0, 10) <= String(endDate).slice(0, 10);
  });
}

function reportRequestKey(){
  return [reportFilters.period, reportFilters.year, reportFilters.month, reportFilters.client, reportFilters.device].join('|');
}

function reportSelectedMachine(){
  if(reportFilters.device) return reportFilters.device;
  if(isUserRole()){
    const assigned = scopedDevices();
    if(assigned.length === 1) return assigned[0].backendId || assigned[0].id || '';
  }
  return '';
}

function reportMetricNumber(value){
  if(value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function reportMetricModel(){
  const hasApiData = reportApiData && reportApiKey === reportRequestKey();
  const summary = hasApiData && reportApiData.summary ? reportApiData.summary : {};
  return {
    wasteInAverageKg:reportMetricNumber(summary.wasteInAverageKg),
    wasteInTotalKg:reportMetricNumber(summary.wasteInTotalKg),
    wasteKg:reportMetricNumber(summary.wasteInTotalKg),
    ghgKg:reportMetricNumber(summary.ghgKg),
    energyKwh:reportMetricNumber(summary.energyKwh),
    fertilizerKg:reportMetricNumber(summary.fertilizerKg),
    avgTempC:reportMetricNumber(summary.avgTempC),
    avgHumidityPct:reportMetricNumber(summary.avgHumidityPct),
    standbyDeviceDays:reportMetricNumber(summary.standbyDeviceDays),
    observedDeviceDays:reportMetricNumber(summary.observedDeviceDays),
    empty:!hasApiData || summary.pointCount === 0
  };
}

function reportVendorDataStatus(){
  const hasApiData = reportApiData && reportApiKey === reportRequestKey();
  if(!hasApiData) return null;
  const source = reportApiData.dataSources && reportApiData.dataSources.dailyStats;
  const status = source && source.status;
  const pointCount = Number(reportApiData.summary && reportApiData.summary.pointCount) || 0;
  if(status === 'partial'){
    return { text:'Some vendor daily reports are unavailable for the selected period.', color:'#f59e0b' };
  }
  if(status === 'unavailable') return { text:'Vendor daily reports are unavailable.', color:'#ef4444' };
  if(status === 'empty' || pointCount === 0) return { text:'No vendor daily report for the selected period.', color:'#94a3b8' };
  return null;
}

function reportMetricDisplay(value, unit){
  return value === null || value === undefined ? '—' : Number(value).toFixed(1);
}

function reportShowsEnergy(){
  return !isClientScopedRole();
}

function reportDisplayTitle(){
  const assignedCount = scopedDevices().length;
  const dimension = isUserRole() && !reportFilters.device && assignedCount > 1
    ? 'Assigned Devices'
    : (reportFilters.device || (isUserRole() && assignedCount === 1) ? 'Machine' : 'Client');
  return dimension + ' ' + reportPeriodTitle() + ' Report';
}

function reportRowsForPeriod(){
  const range = reportPeriodRange();
  const visibleIds = new Set(scopedDevices().map(function(device){ return device.id; }));
  const historyRows = window.BSF_DEVICE_HISTORY_ROWS || [];
  const storedRows = (window.BSF_GRAPH_HISTORY_ROWS && window.BSF_GRAPH_HISTORY_ROWS.length)
    ? window.BSF_GRAPH_HISTORY_ROWS
    : rawDataRows;
  const sourceRows = window.BSF_MERGE_ROWS ? window.BSF_MERGE_ROWS(historyRows, storedRows) : historyRows.concat(storedRows);
  return sourceRows.filter(function(row){
    if(!visibleIds.has(row.device)) return false;
    const dateText = String(row.recordedAt || '').slice(0,10);
    if(!dateText || dateText < range.start || dateText > range.end) return false;
    if(reportFilters.client){
      const device = devices.find(function(item){ return item.id === row.device; });
      if(!device || device.client !== reportFilters.client) return false;
    }
    if(reportFilters.device && row.device !== reportFilters.device) return false;
    return true;
  });
}

function reportAddDays(value, days){
  const date = new Date(String(value || '').slice(0,10) + 'T00:00:00Z');
  if(!Number.isFinite(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0,10);
}

function reportExportRanges(){
  const range = reportPeriodRange();
  const ranges = [];
  let start = range.start;
  const finalExclusive = reportAddDays(range.end, 1);
  while(start < finalExclusive){
    const candidate = reportAddDays(start, 60);
    const end = candidate < finalExclusive ? candidate : finalExclusive;
    ranges.push({ start:start + 'T00:00:00', end:end + 'T00:00:00' });
    start = end;
  }
  return ranges;
}

function reportMergeExportRows(rows){
  const unique = new Map();
  (Array.isArray(rows) ? rows : []).forEach(function(row){
    if(!row || !row.device || !row.recordedAt) return;
    unique.set(row.device + '@' + (row.sourceTimestampSeconds || row.recordedAt), row);
  });
  return Array.from(unique.values()).sort(function(left, right){
    return String(left.recordedAt).localeCompare(String(right.recordedAt)) ||
      String(left.device).localeCompare(String(right.device));
  });
}

async function reportRowsForExcelExport(){
  if(typeof window.BSF_LOAD_RAW_SAMPLES !== 'function') return reportRowsForPeriod();
  const selected = scopedDevices().find(function(device){
    return String(device.backendId || device.id) === String(reportFilters.device);
  });
  const fallback = isUserRole() && scopedDevices().length === 1 ? scopedDevices()[0] : null;
  const exportDevice = selected || fallback;
  const rows = [];
  for(const range of reportExportRanges()){
    let page = 1;
    let total = 0;
    let fetched = 0;
    while(page <= 1000){
      const result = await window.BSF_LOAD_RAW_SAMPLES({
        page:page,
        pageSize:30,
        start:range.start,
        end:range.end,
        clientId:reportFilters.client || undefined,
        machineId:exportDevice ? exportDevice.id : undefined,
        devices:scopedDevices(),
      });
      const batch = result && Array.isArray(result.rows) ? result.rows : [];
      rows.push.apply(rows, batch);
      fetched += batch.length;
      total = Number(result && result.total) || 0;
      if(!batch.length || fetched >= total) break;
      page += 1;
    }
    if(fetched < total) throw new Error('The report contains too many samples; narrow the period.');
  }
  return reportMergeExportRows(rows);
}

function reportYearOptions(){
  const years = new Set(rawDataRows.map(function(row){ return String(row.recordedAt || '').slice(0,4); }).filter(Boolean));
  years.add(String(reportFilters.year || new Date().getFullYear()));
  return Array.from(years).sort().reverse().map(function(year){
    return '<option value="' + year + '"' + (String(reportFilters.year)===year?' selected':'') + '>' + year + '</option>';
  }).join('');
}

function reportMonthOptions(){
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return monthNames.map(function(label, index){
    const value = String(index + 1);
    return '<option value="' + value + '"' + (String(reportFilters.month)===value?' selected':'') + '>' + label + '</option>';
  }).join('');
}

function reportFilterOptions(){
  const clients = scopedClientNames();
  const clientScoped = isClientScopedRole();
  const clientOptions = (clientScoped ? '' : '<option value="">Select Customer</option>') + clients.map(function(client){
    return '<option value="' + bsfEscapeHtml(client) + '"' + (reportFilters.client===client?' selected':'') + '>' + bsfEscapeHtml(client) + '</option>';
  }).join('');
  const availableDevices = scopedDevices().filter(function(dev){
    return !reportFilters.client || dev.client === reportFilters.client;
  });
  const allAssignedOption = isUserRole() && availableDevices.length > 1
    ? '<option value=""' + (reportFilters.device === '' ? ' selected' : '') + '>All Assigned Devices</option>'
    : '';
  const deviceOptions = (isUserRole() ? allAssignedOption : '<option value="">Select Machine</option>') + availableDevices.map(function(dev){
    const value = dev.backendId || dev.id;
    return '<option value="' + bsfEscapeHtml(value) + '"' + (String(reportFilters.device)===String(value)?' selected':'') + '>' + bsfEscapeHtml(dev.id) + '</option>';
  }).join('');
  return { clientOptions:clientOptions, deviceOptions:deviceOptions };
}
function reportFoodWasteValue(row){
  const raw = row && (row.value !== undefined ? row.value : row.waste !== undefined ? row.waste : row.weight);
  if(raw === null || raw === undefined || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function reportFoodWasteDateParts(row){
  const raw = row && (row.date || row.timestamp || row.period || row.label);
  if(typeof raw === 'number' && Number.isFinite(raw)){
    const date = new Date(raw < 1000000000000 ? raw * 1000 : raw);
    if(Number.isFinite(date.getTime())) return { year:date.getFullYear(), month:date.getMonth() + 1, day:date.getDate() };
  }
  const text = String(raw || '').trim();
  const iso = text.match(/(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if(iso) return { year:Number(iso[1]), month:Number(iso[2]), day:iso[3] ? Number(iso[3]) : null };
  const selectedYear = Number(reportFilters.year) || new Date().getFullYear();
  const yearMatch = text.match(/(\d{4})/);
  const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const monthMatch = text.toLowerCase().match(/[a-z]+/);
  const monthIndex = monthMatch ? monthNames.indexOf(monthMatch[0]) : -1;
  if(monthIndex >= 0) return { year:yearMatch ? Number(yearMatch[1]) : selectedYear, month:monthIndex + 1, day:null };
  if(reportFilters.period === 'monthly'){
    const dayMatch = text.match(/^(\d{1,2})$/);
    if(dayMatch) return { year:selectedYear, month:Number(reportFilters.month), day:Number(dayMatch[1]) };
  }
  return null;
}

function normalizedReportWeightRows(includeMissing){
  const hasApiData = reportApiData && reportApiKey === reportRequestKey();
  const source = hasApiData && Array.isArray(reportApiData.weightItems) ? reportApiData.weightItems : [];
  if(!source.length) return normalizedReportFoodWasteRows(includeMissing);
  return source.map(function(row){
    const value = reportFoodWasteValue({ value:row && row.averageKg !== undefined ? row.averageKg : row && row.value });
    return {
      label:row && (row.date || row.label) || '',
      xLabel:row && row.label || '',
      value:value
    };
  }).filter(function(row){
    return includeMissing || row.value !== null;
  });
}

function normalizedReportMetricRows(items, includeMissing){
  return (Array.isArray(items) ? items : []).map(function(row){
    const rawLabel = String(row && (row.date || row.label) || '');
    const monthlyMatch = rawLabel.match(/^\d{4}-\d{2}-(\d{2})/);
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const yearlyMatch = rawLabel.match(/^\d{4}-(\d{2})$/);
    const xLabel = reportFilters.period === 'monthly' && monthlyMatch
      ? String(Number(monthlyMatch[1]))
      : reportFilters.period === 'yearly' && yearlyMatch
        ? monthNames[Number(yearlyMatch[1]) - 1]
        : row && row.label || '';
    return {
      label:row && (row.date || row.label) || '',
      xLabel:xLabel,
      value:reportFoodWasteValue(row)
    };
  }).filter(function(row){
    return includeMissing || row.value !== null;
  });
}

function normalizedReportFoodWasteRows(includeMissing){
  const range = reportPeriodRange();
  const selectedYear = Number(range.start.slice(0, 4));
  const selectedMonth = Number(range.start.slice(5, 7));
  const buckets = new Map();
  reportFoodWasteData.forEach(function(row){
    const value = reportFoodWasteValue(row);
    if(value === null) return;
    const parts = reportFoodWasteDateParts(row);
    if(!parts) return;
    if(reportFilters.period === 'monthly'){
      if(parts.year !== selectedYear || parts.month !== selectedMonth || !parts.day) return;
      const key = reportPad(parts.day);
      buckets.set(key, (buckets.get(key) || 0) + value);
    } else {
      if(parts.year !== selectedYear || !parts.month) return;
      const key = reportPad(parts.month);
      buckets.set(key, (buckets.get(key) || 0) + value);
    }
  });
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if(reportFilters.period === 'monthly'){
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const rows = [];
    for(let day=1; day<=lastDay; day++){
      const key = reportPad(day);
      const hasValue = buckets.has(key);
      if(hasValue || includeMissing) rows.push({ label:selectedYear + '-' + reportPad(selectedMonth) + '-' + key, xLabel:key, value:hasValue ? buckets.get(key) : null });
    }
    return rows;
  }
  const rows = [];
  for(let month=1; month<=12; month++){
    const key = reportPad(month);
    const hasValue = buckets.has(key);
    if(hasValue || includeMissing) rows.push({ label:selectedYear + '-' + key, xLabel:monthNames[month-1], value:hasValue ? buckets.get(key) : null });
  }
  return rows;
}

function buildReportLineChartSvg(rows, options){
  const config = options || {};
  const unit = config.unit || 'KG';
  const color = config.color || '#3b82f6';
  const emptyMessage = config.emptyMessage || 'No data for selected period';
  const ariaLabel = config.ariaLabel || 'Average line chart';
  const validValues = rows.map(function(row){ return row.value; }).filter(Number.isFinite);
  if(!validValues.length) return '<div style="height:200px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:13px;">' + emptyMessage + '</div>';
  const width = 1000, height = 200, left = 54, right = 20, top = 24, bottom = 36;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const rawMax = Math.max.apply(null, validValues);
  const rawMin = Math.min.apply(null, validValues);
  const padding = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.04, 0.1);
  const minValue = Math.max(0, rawMin - padding);
  const maxValue = rawMax + padding;
  const scale = Math.max(maxValue - minValue, 1);
  const yFor = function(value){
    return top + plotHeight - ((value - minValue) / scale) * plotHeight;
  };
  const step = rows.length > 1 ? plotWidth / (rows.length - 1) : 0;
  const points = rows.map(function(row, index){
    if(!Number.isFinite(row.value)) return null;
    const x = left + step * index;
    return {
      x:x,
      y:yFor(row.value),
      label:row.xLabel || row.label,
      value:row.value,
      index:index
    };
  });
  const segments = [];
  let current = [];
  points.forEach(function(point){
    if(!point){
      if(current.length > 1) segments.push(current);
      current = [];
      return;
    }
    current.push(point);
  });
  if(current.length > 1) segments.push(current);
  const path = segments.map(function(segment){
    const commands = segment.map(function(point, index){
      return (index ? 'L ' : 'M ') + point.x.toFixed(1) + ' ' + point.y.toFixed(1);
    }).join(' ');
    return '<path class="report-average-line" d="' + commands + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>';
  }).join('');
  const dots = points.filter(Boolean).map(function(point){
    return '<circle class="report-average-point" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) +
      '" r="3.5" fill="' + color + '"><title>' + point.label + ': ' + Number(point.value).toFixed(1) +
      ' ' + unit + '</title></circle>';
  }).join('');
  const labelStep = rows.length > 31 ? Math.max(1, Math.ceil(rows.length / 12)) : 1;
  const labels = rows.map(function(row, index){
    if(index % labelStep !== 0 && index !== rows.length - 1) return '';
    const x = left + (rows.length > 1 ? step * index : 0);
    return '<text x="' + x.toFixed(1) + '" y="' + (height - 10) + '" text-anchor="middle" fill="#64748b" font-size="10">' + (row.xLabel || row.label) + '</text>';
  }).join('');
  const gridlines = [0, 0.5, 1].map(function(ratio){
    const value = minValue + scale * ratio;
    const y = yFor(value);
    return '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (left + plotWidth) + '" y2="' + y.toFixed(1) + '" stroke="#334155" stroke-width="1" />' +
      '<text x="' + (left - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" fill="#64748b" font-size="10">' + value.toFixed(1) + '</text>';
  }).join('');
  const legend = '<g><circle cx="' + (width - 116) + '" cy="10" r="3.5" fill="' + color + '"/>' +
    '<line x1="' + (width - 116) + '" y1="10" x2="' + (width - 96) + '" y2="10" stroke="' + color + '" stroke-width="2.5"/>' +
    '<text x="' + (width - 90) + '" y="13" fill="#94a3b8" font-size="10">Average</text></g>';
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="' + ariaLabel + '" style="width:100%;height:200px;display:block;">' +
    gridlines + path + dots + labels + legend + '</svg>';
}

function buildReportFoodWasteSvg(rows){
  return buildReportLineChartSvg(rows, {
    unit:'KG',
    color:'#3b82f6',
    emptyMessage:'No Weight data for selected period',
    ariaLabel:'Average weight line chart'
  });
}

function buildReportTemperatureSvg(rows){
  return buildReportLineChartSvg(rows, {
    unit:'°C',
    color:'#f97316',
    emptyMessage:'No Temperature data for selected period',
    ariaLabel:'Average temperature line chart'
  });
}

function buildReportHumiditySvg(rows){
  return buildReportLineChartSvg(rows, {
    unit:'%',
    color:'#0ea5e9',
    emptyMessage:'No Humidity data for selected period',
    ariaLabel:'Average humidity line chart'
  });
}

function renderReportFoodWasteChart(){
  const chart = document.getElementById('report-food-waste-chart');
  if(chart) chart.innerHTML = buildReportFoodWasteSvg(normalizedReportWeightRows(true));
  const temperature = document.getElementById('report-temperature-chart');
  if(temperature){
    temperature.innerHTML = buildReportTemperatureSvg(normalizedReportMetricRows(
      reportApiData && reportApiData.tempItems,
      true
    ));
  }
  const humidity = document.getElementById('report-humidity-chart');
  if(humidity){
    humidity.innerHTML = buildReportHumiditySvg(normalizedReportMetricRows(
      reportApiData && reportApiData.humidityItems,
      true
    ));
  }
}

async function loadReportFoodWaste(options){
  const force = options === true || Boolean(options && options.force);
  if(!window.BSF_API || !window.BSF_API_CONFIG || !window.BSF_API_CONFIG.enabled){
    reportApiData = null;
    reportApiKey = '';
    reportFoodWasteData = [];
    reportApiRequestPromise = null;
    renderReportFoodWasteChart();
    return null;
  }
  const key = reportRequestKey();
  if(!force && reportApiKey === key && reportApiData) return reportApiData;
  if(reportApiRequestKey === key && reportApiRequestPromise) return reportApiRequestPromise;
  reportApiRequestKey = key;
  reportApiRequestPromise = (async function(){
    const params = {
      period:reportFilters.period,
      year:reportFilters.year,
      month:reportFilters.period === 'monthly' ? reportFilters.month : undefined,
      clientId:reportFilters.client || undefined,
      machineId:reportSelectedMachine() || undefined
    };
    try {
      const data = await window.BSF_API.getReports(params);
      if(key !== reportRequestKey()) return null;
      reportApiData = data && typeof data === 'object' && !Array.isArray(data) ? data : { items:[] };
      reportApiKey = key;
      reportFoodWasteData = reportApiData.items || reportApiData.list || [];
    } catch(error) {
      if(key === reportRequestKey()){
        reportApiData = null;
        reportApiKey = '';
        reportFoodWasteData = [];
      }
    } finally {
      if(reportApiRequestKey === key) reportApiRequestPromise = null;
    }
    if(currentPage === 'reports' && reportRequestKey() === key){
      renderReports(document.getElementById('page-content'), { skipLoad:true });
    }
    return reportApiData;
  })();
  return reportApiRequestPromise;
}

function setReportFilter(key, value){
  reportFilters[key] = value;
  if(key === 'year') reportYearManuallySelected = true;
  if(key === 'client') reportFilters.device = '';
  renderReports(document.getElementById('page-content'));
}

function renderReports(container, options){
  syncReportCalendarYear();
  const range = reportPeriodRange();
  const metrics = reportMetricModel();
  const scopedDevice = scopedDevices()[0] || null;
  const assignedCount = scopedDevices().length;
  const reportClient = reportFilters.client || (isClientScopedRole() ? (scopedDevice ? scopedDevice.client : 'Unassigned') : 'Select Customer');
  const selectedDevice = scopedDevices().find(function(device){
    return String(device.backendId || device.id) === String(reportFilters.device);
  });
  const reportDevice = selectedDevice
    ? selectedDevice.id
    : (reportFilters.device || (isUserRole() && assignedCount > 1 ? 'All Assigned Devices' : (isUserRole() && scopedDevice ? scopedDevice.id : 'Select Machine')));
  const reportPeriod = range.start + ' - ' + range.end;
  const reportOptions = reportFilterOptions();
  const title = reportDisplayTitle();
  const chartTitle = reportWeightChartTitle();
  const temperatureChartTitle = reportTemperatureChartTitle();
  const humidityChartTitle = reportHumidityChartTitle();
  const wasteValue = reportMetricDisplay(metrics.wasteKg);
  const ghgValue = reportMetricDisplay(metrics.ghgKg);
  const energyDisplay = reportEnergyDisplay(metrics);
  const energyValue = reportMetricDisplay(energyDisplay.value);
  const fertilizerValue = reportMetricDisplay(metrics.fertilizerKg);
  const avgTemp = reportMetricDisplay(metrics.avgTempC);
  const avgHumidity = reportMetricDisplay(metrics.avgHumidityPct);
  const vendorDataStatus = reportVendorDataStatus();
  const vendorDataStatusMarkup = vendorDataStatus
    ? '<p id="report-data-status" role="status" style="margin:-16px 0 24px;text-align:center;color:' + vendorDataStatus.color + ';font-size:13px;">' + bsfEscapeHtml(vendorDataStatus.text) + '</p>'
    : '';
  const energyCard = reportShowsEnergy() ? card(energyDisplay.label, energyValue, 'kWh', '#ef4444') : '';
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Report Generation</h2>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;align-items:center;">
      ${isClientScopedRole() ? clientScopeBadge() : '<select onchange="setReportFilter(\'client\',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">' + reportOptions.clientOptions + '</select>'}
      <select onchange="setReportFilter('period',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;"><option value="monthly"${reportFilters.period==='monthly'?' selected':''}>Monthly Report</option><option value="yearly"${reportFilters.period==='yearly'?' selected':''}>Yearly Report</option></select>
      ${reportFilters.period === 'monthly' ? '<select id="report-month-filter" onchange="setReportFilter(\'month\',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">' + reportMonthOptions() + '</select>' : ''}
      ${reportFilters.period === 'yearly' ? '<select id="report-year-filter" onchange="setReportFilter(\'year\',this.value)" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">' + reportYearOptions() + '</select>' : ''}
      <select ${isUserRole() && assignedCount <= 1 ? 'disabled' : ''} onchange="setReportFilter('device',this.value)" style="padding:10px 16px;background:${isUserRole() && assignedCount <= 1?'#111827':'#1e293b'};border:1px solid #334155;border-radius:8px;color:${isUserRole() && assignedCount <= 1?'#94a3b8':'#e2e8f0'};font-size:14px;cursor:${isUserRole() && assignedCount <= 1?'not-allowed':'pointer'};">${reportOptions.deviceOptions}</select>
      <button onclick="generateReportPreview()" style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Generate Preview</button>
    </div>
    <div id="report-preview" style="background:#1e293b;border-radius:12px;padding:32px;border:1px solid #334155;max-width:900px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #334155;">
        <h1 style="font-size:24px;font-weight:700;color:#f8fafc;margin:0;">${title}</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">${reportPeriod} · ${reportClient} · ${reportDevice}</p>
      </div>
      ${vendorDataStatusMarkup}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px;">
        ${card('Waste Collected', wasteValue, 'kg', '#3b82f6')}
        ${card('GHG Reduced', ghgValue, 'kg CO₂e', '#10b981')}
        ${energyCard}
        ${card('Est. Fertilizer', fertilizerValue, 'kg', '#f59e0b')}
        ${card('Avg Container Temp', avgTemp, '°C', '#f97316')}
        ${card('Avg Humidity', avgHumidity, '%', '#0ea5e9')}
      </div>
      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">${chartTitle}</h3>
        <div id="report-food-waste-chart" style="background:#0f172a;border-radius:8px;padding:12px;border:1px solid #334155;"></div>
      </div>
      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">${temperatureChartTitle}</h3>
        <div id="report-temperature-chart" style="background:#0f172a;border-radius:8px;padding:12px;border:1px solid #334155;"></div>
      </div>
      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">${humidityChartTitle}</h3>
        <div id="report-humidity-chart" style="background:#0f172a;border-radius:8px;padding:12px;border:1px solid #334155;"></div>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:32px;padding-top:24px;border-top:1px solid #334155;">
        <button style="padding:12px 24px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="exportReportPdf()">Export PDF</button>
        <button style="padding:12px 24px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="exportReportExcel()">Export Excel</button>
      </div>
    </div>
  `;
  renderReportFoodWasteChart();
  if(!options || !options.skipLoad) loadReportFoodWaste();
}

async function generateReportPreview(){
  const container = document.getElementById('page-content');
  showReportExportToast('Generating report preview...');
  await loadReportFoodWaste({ force:true });
  if(currentPage !== 'reports' || !container) return;
  const loaded = reportApiData && reportApiKey === reportRequestKey();
  const preview = container.querySelector('#report-preview');
  if(preview) preview.scrollIntoView({ behavior:'smooth', block:'start' });
  showReportExportToast(loaded ? 'Report preview updated' : 'Report data unavailable', loaded ? 'success' : 'error');
}

function reportExportModel(){
  const range = reportPeriodRange();
  const metrics = reportMetricModel();
  const scopedDevice = scopedDevices()[0] || null;
  const assignedCount = scopedDevices().length;
  const reportClient = reportFilters.client || (isClientScopedRole() ? (scopedDevice ? scopedDevice.client : 'Unassigned') : 'Select Customer');
  const reportDevice = reportFilters.device || (isUserRole() && assignedCount > 1 ? 'All Assigned Devices' : (isUserRole() && scopedDevice ? scopedDevice.id : 'Select Machine'));
  const exportEndDate = reportPdfEndDate(range);
  const reportPeriod = range.start + ' - ' + exportEndDate;
  const title = reportDisplayTitle();
  const chartTitle = reportWeightChartTitle();
  const foodWaste = reportRowsThroughDate(normalizedReportWeightRows(true), exportEndDate);
  const temperature = reportRowsThroughDate(normalizedReportMetricRows(
    reportApiData && reportApiData.tempItems,
    true
  ), exportEndDate);
  const humidity = reportRowsThroughDate(normalizedReportMetricRows(
    reportApiData && reportApiData.humidityItems,
    true
  ), exportEndDate);
  const energyDisplay = reportEnergyDisplay(metrics);
  return {
    title:title,
    pdfTitle:title,
    chartTitle:chartTitle,
    period:reportPeriod,
    exportStartDate:range.start,
    exportEndDate:exportEndDate,
    client:reportClient,
    device:reportDevice,
    metrics:{
      wasteInAverageKg:reportMetricDisplay(metrics.wasteInAverageKg),
      wasteInTotalKg:reportMetricDisplay(metrics.wasteInTotalKg),
      wasteKg:reportMetricDisplay(metrics.wasteKg),
      ghgKg:reportMetricDisplay(metrics.ghgKg),
      energyKwh:reportMetricDisplay(energyDisplay.value),
      energyLabel:energyDisplay.label,
      fertilizerKg:reportMetricDisplay(metrics.fertilizerKg),
      avgTempC:reportMetricDisplay(metrics.avgTempC),
      avgHumidityPct:reportMetricDisplay(metrics.avgHumidityPct)
    },
    foodWaste:foodWaste,
    temperature:temperature,
    humidity:humidity,
    temperatureChartTitle:reportTemperatureChartTitle(),
    humidityChartTitle:reportHumidityChartTitle()
  };
}

let reportExportToastTimer = null;

function showReportExportToast(message, type){
  let toast = document.getElementById('report-export-toast');
  if(!toast){ toast = document.createElement('div'); toast.id = 'report-export-toast'; document.body.appendChild(toast); }
  const success = type !== 'error';
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;padding:12px 18px;border-radius:8px;color:' + (success ? '#e2e8f0' : '#fecaca') + ';background:' + (success ? '#065f46' : '#7f1d1d') + ';border:1px solid ' + (success ? '#10b981' : '#ef4444') + ';box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:13px;font-weight:600;opacity:1;transition:opacity .2s;';
  if(reportExportToastTimer) clearTimeout(reportExportToastTimer);
  reportExportToastTimer = setTimeout(function(){ toast.style.opacity = '0'; setTimeout(function(){ if(toast) toast.remove(); }, 250); }, 3200);
}

let reportJsPdfPromise = null;

function loadReportJsPdf(){
  if(window.jspdf && typeof window.jspdf.jsPDF === 'function'){
    return Promise.resolve(window.jspdf.jsPDF);
  }
  if(reportJsPdfPromise) return reportJsPdfPromise;
  reportJsPdfPromise = new Promise(function(resolve, reject){
    const existing = document.querySelector('script[data-bsf-jspdf]');
    const script = existing || document.createElement('script');
    script.dataset.bsfJspdf = 'true';
    script.async = true;
    script.onload = function(){
      const JsPDF = window.jspdf && window.jspdf.jsPDF;
      if(typeof JsPDF === 'function') resolve(JsPDF);
      else reject(new Error('PDF component did not initialize'));
    };
    script.onerror = function(){
      reject(new Error('PDF component could not be loaded'));
    };
    if(!existing){
      script.src = '/src/vendor/jspdf.umd.min.js';
      document.head.appendChild(script);
    }
  }).catch(function(error){
    reportJsPdfPromise = null;
    showReportExportToast(error.message || 'PDF component could not be loaded', 'error');
    return null;
  });
  return reportJsPdfPromise;
}

function downloadReportFile(filename, mime, content){
  downloadReportBlob(filename, new Blob([content], { type:mime }));
}

function downloadReportBlob(filename, blob){
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
}

function downloadReportDataUrl(filename, dataUrl){
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function csvCell(value){
  return '"' + bsfSpreadsheetSafeText(value).replace(/"/g, '""') + '"';
}

function excelCell(value){
  return '<td>' + bsfEscapeHtml(bsfSpreadsheetSafeText(value)) + '</td>';
}

function exportReportCsv(){
  const model = reportExportModel();
  const rows = [['Report',model.title],['Period',model.period],['Client',model.client],['Machine',model.device],[],['Metric','Value','Unit'],['Daily Waste-in',model.metrics.wasteInAverageKg,'kg'],['Total Waste-in',model.metrics.wasteInTotalKg,'kg'],['Waste Collected',model.metrics.wasteKg,'kg'],['GHG Reduced',model.metrics.ghgKg,'kg CO₂e'],...(reportShowsEnergy() ? [[model.metrics.energyLabel,model.metrics.energyKwh,'kWh']] : []),['Est. Fertilizer',model.metrics.fertilizerKg,'kg'],['Avg Container Temp',model.metrics.avgTempC,'°C'],['Avg Humidity',model.metrics.avgHumidityPct,'%'],[],[model.chartTitle]];
  model.foodWaste.forEach(function(row){ rows.push([row.label,row.value]); });
  downloadReportFile('bsf-report-' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv;charset=utf-8', '\uFEFF' + rows.map(function(row){ return row.map(csvCell).join(','); }).join('\r\n'));
  showReportExportToast('CSV 导出已开始');
}

async function exportReportExcel(){
  if(!window.BSF_REPORT_XLSX || typeof window.BSF_REPORT_XLSX.build !== 'function'){
    showReportExportToast('Excel generator is unavailable', 'error');
    return;
  }
  showReportExportToast('Loading complete report data...');
  try {
    const rows = await reportRowsForExcelExport();
    const range = reportPeriodRange();
    const blob = window.BSF_REPORT_XLSX.build(rows, {
      chartTitle:reportExcelChartTitle(),
      chartPeriod:reportFilters.period,
      periodStart:range.start,
      periodEnd:range.end
    });
    downloadReportBlob('bsf-report-' + new Date().toISOString().slice(0,10) + '.xlsx', blob);
    showReportExportToast('Excel export started');
  } catch(error) {
    showReportExportToast(error && error.message ? error.message : 'Report Excel export failed', 'error');
  }
}

function reportPdfMetricCards(model){
  return [
    { label:'Waste Collected', value:model.metrics.wasteKg, unit:'kg', color:[59,130,246] },
    { label:'GHG Reduced', value:model.metrics.ghgKg, unit:'kg CO2e', color:[16,185,129] },
    { label:model.metrics.energyLabel, value:model.metrics.energyKwh, unit:'kWh', color:[239,68,68] },
    { label:'Est. Fertilizer', value:model.metrics.fertilizerKg, unit:'kg', color:[245,158,11] },
    { label:'Avg Container Temp', value:model.metrics.avgTempC, unit:'°C', color:[249,115,22] },
    { label:'Avg Humidity', value:model.metrics.avgHumidityPct, unit:'%', color:[14,165,233] }
  ];
}

function buildReportPdfDocument(JsPDF, model){
  const doc = new JsPDF({ orientation:'portrait', unit:'pt', format:'a4', compress:true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 34;
  const contentWidth = pageWidth - margin * 2;
  const pdfText = function(value){
    return String(value === null || value === undefined ? '' : value)
      .replace(/CO₂e/g, 'CO2e')
      .replace(/₂/g, '2')
      .replace(/²/g, '2');
  };
  const paintPage = function(){
    doc.setFillColor(15,23,42);
    doc.rect(0,0,pageWidth,pageHeight,'F');
  };
  const addPage = function(){
    doc.addPage();
    paintPage();
    return margin;
  };
  paintPage();

  doc.setTextColor(248,250,252);
  doc.setFont('helvetica','bold');
  doc.setFontSize(21);
  doc.text(pdfText(model.pdfTitle || model.title), pageWidth / 2, 42, { align:'center' });
  doc.setTextColor(148,163,184);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text(pdfText(model.period + ' · ' + model.client + ' · ' + model.device), pageWidth / 2, 61, { align:'center' });
  doc.setDrawColor(51,65,85);
  doc.setLineWidth(0.7);
  doc.line(margin, 76, pageWidth - margin, 76);

  const cards = reportPdfMetricCards(model);
  const gap = 10;
  const cardWidth = (contentWidth - gap * 2) / 3;
  const cardHeight = 58;
  cards.forEach(function(card, index){
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + column * (cardWidth + gap);
    const y = 92 + row * (cardHeight + gap);
    doc.setFillColor(30,41,59);
    doc.setDrawColor(51,65,85);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, cardWidth, cardHeight, 7, 7, 'FD');
    doc.setTextColor(148,163,184);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(pdfText(card.label).toUpperCase(), cardWidth - 20), x + 10, y + 15);
    doc.setTextColor(card.color[0], card.color[1], card.color[2]);
    doc.setFontSize(18);
    doc.text(pdfText(card.value), x + 10, y + 39);
    const valueWidth = doc.getTextWidth(pdfText(card.value));
    doc.setTextColor(100,116,139);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text(pdfText(card.unit), x + 13 + valueWidth, y + 39);
  });

  const drawChart = function(rows, options, preferredY){
    let y = preferredY;
    const boxHeight = 190;
    if(y + boxHeight > pageHeight - margin){
      y = addPage();
    }
    doc.setTextColor(148,163,184);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.text(pdfText(options.title).toUpperCase(), margin, y + 10);
    const boxY = y + 20;
    doc.setFillColor(15,23,42);
    doc.setDrawColor(51,65,85);
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, boxY, contentWidth, boxHeight - 24, 7, 7, 'FD');

    const values = (rows || []).map(function(row){
      const value = Number(row && row.value);
      return Number.isFinite(value) ? value : null;
    });
    const known = values.filter(function(value){ return value !== null; });
    if(!known.length){
      doc.setTextColor(100,116,139);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text('No data for the selected period', pageWidth / 2, boxY + 78, { align:'center' });
      return boxY + boxHeight - 10;
    }
    const plotLeft = margin + 42;
    const plotRight = margin + contentWidth - 18;
    const plotTop = boxY + 30;
    const plotBottom = boxY + boxHeight - 58;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    const minKnown = Math.min.apply(null, known);
    const maxKnown = Math.max.apply(null, known);
    const padding = Math.max((maxKnown - minKnown) * 0.12, maxKnown * 0.04, 0.1);
    const minValue = Math.max(0, minKnown - padding);
    const maxValue = maxKnown + padding;
    const scale = Math.max(maxValue - minValue, 1);
    const yFor = function(value){
      return plotBottom - ((value - minValue) / scale) * plotHeight;
    };
    const step = values.length > 1 ? plotWidth / (values.length - 1) : 0;

    for(let gridIndex=0; gridIndex<3; gridIndex++){
      const ratio = gridIndex / 2;
      const value = minValue + scale * ratio;
      const gridY = yFor(value);
      doc.setDrawColor(51,65,85);
      doc.setLineWidth(0.5);
      doc.line(plotLeft, gridY, plotRight, gridY);
      doc.setTextColor(100,116,139);
      doc.setFont('helvetica','normal');
      doc.setFontSize(6.5);
      doc.text(value.toFixed(1), plotLeft - 5, gridY + 2, { align:'right' });
    }

    doc.setDrawColor(options.color[0], options.color[1], options.color[2]);
    doc.setFillColor(options.color[0], options.color[1], options.color[2]);
    doc.setLineWidth(1.6);
    let previous = null;
    values.forEach(function(value, index){
      if(value === null){
        previous = null;
        return;
      }
      const x = plotLeft + step * index;
      const pointY = yFor(value);
      if(previous){
        doc.line(previous.x, previous.y, x, pointY);
      }
      doc.circle(x, pointY, 1.4, 'F');
      previous = { x:x, y:pointY };
    });

    const labelStep = rows.length > 31 ? Math.max(1, Math.ceil(rows.length / 12)) : 1;
    doc.setTextColor(100,116,139);
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    rows.forEach(function(row, index){
      if(index % labelStep !== 0 && index !== rows.length - 1) return;
      const x = plotLeft + (rows.length > 1 ? step * index : 0);
      doc.text(pdfText(row.xLabel || row.label), x, plotBottom + 14, { align:'center' });
    });
    return boxY + boxHeight;
  };

  let chartY = 236;
  chartY = drawChart(model.foodWaste, {
    title:model.chartTitle,
    color:[59,130,246]
  }, chartY) + 14;
  chartY = drawChart(model.temperature, {
    title:model.temperatureChartTitle,
    color:[249,115,22]
  }, chartY) + 14;
  drawChart(model.humidity, {
    title:model.humidityChartTitle,
    color:[14,165,233]
  }, chartY);
  return doc;
}

async function exportReportPdf(){
  showReportExportToast('Loading PDF component...');
  const JsPDF = await loadReportJsPdf();
  const model = reportExportModel();
  const pdfTitle = model.pdfTitle || model.title;
  if(typeof JsPDF === 'function'){
    const doc = buildReportPdfDocument(JsPDF, model);
    const fileName = 'bsf-report-' + model.exportStartDate + '_to_' + model.exportEndDate + '.pdf';
    if(typeof window.showSaveFilePicker === 'function'){
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          startIn: 'downloads',
          types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(doc.output('blob'));
        await writable.close();
        showReportExportToast('PDF 已保存');
        return;
      } catch(error) {
        if(error && error.name === 'AbortError') return;
      }
    }
    downloadReportDataUrl(fileName, doc.output('datauristring'));
    showReportExportToast('PDF 已开始下载，请查看浏览器下载目录');
    return;
  }

  const preview = document.getElementById('report-preview');
  if(!preview){ showReportExportToast('Report preview is unavailable', 'error'); return; }
  const printWindow = window.open('', '_blank');
  if(!printWindow){ showReportExportToast('浏览器阻止了打印窗口，请允许弹窗', 'error'); return; }
  printWindow.document.write('<html><head><meta charset="UTF-8"><title>' + bsfEscapeHtml(pdfTitle) + '</title><style>@page{size:A4 portrait;margin:8mm;}html,body{background:#0f172a !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}body{margin:0;padding:0;}#report-preview{max-width:none !important;margin:0 !important;}.report-chart-section{break-inside:avoid;page-break-inside:avoid;}</style></head><body>' + preview.outerHTML + '</body></html>');
  printWindow.document.close();
  printWindow.focus();
  showReportExportToast('PDF 组件未加载，已打开打印窗口作为备用');
  setTimeout(function(){ printWindow.print(); }, 500);
}

setInterval(function(){
  if(syncReportCalendarYear() && currentPage === 'reports'){
    renderReports(document.getElementById('page-content'));
  }
}, 60000);
