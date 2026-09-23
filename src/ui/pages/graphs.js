let graphPeriods = { foodWaste:'monthly', ghg:'monthly', temp:'monthly', energy:'monthly' };
let foodWasteData = [];

function graphPeriodLabel(period){
  return period === 'daily' ? 'Daily' : period === 'yearly' ? 'Yearly' : 'Monthly';
}

function graphPeriodButton(chartId, period){
  const active = graphPeriods[chartId] === period;
  return '<button id="period-' + chartId + '-' + period + '" onclick="setGraphPeriod(\'' + chartId + '\', \'' + period + '\')" style="padding:6px 12px;background:' + (active ? '#10b981' : '#334155') + ';border:1px solid ' + (active ? '#10b981' : '#475569') + ';border-radius:6px;color:' + (active ? '#fff' : '#94a3b8') + ';font-size:12px;cursor:pointer;">' + graphPeriodLabel(period) + '</button>';
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
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="3" fill="' + color + '"><title>' + row.label + ': ' + row.value.toFixed(1) + '</title></rect>';
  }).join('');
  const labelStep = Math.max(1, Math.ceil(pointsData.length / 6));
  const labels = pointsData.map(function(row, index){
    const x = left + step * index + step / 2;
    return index % labelStep === 0 || index === pointsData.length - 1 ? '<text x="' + x.toFixed(1) + '" y="' + (height - 8) + '" text-anchor="middle" fill="#64748b" font-size="11">' + row.label + '</text>' : '';
  }).join('');
  const grid = '<line x1="' + left + '" y1="' + (top + plotHeight) + '" x2="' + (left + plotWidth) + '" y2="' + (top + plotHeight) + '" stroke="#334155" stroke-width="1" />' +
    '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (top + plotHeight) + '" stroke="#334155" stroke-width="1" />';
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" style="width:100%;height:180px;display:block;">' + grid + bars + labels + '</svg>';
}
function foodWasteChartMarkup(){
  return '<div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:16px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 id="food-waste-title" style="font-size:14px;font-weight:600;color:#94a3b8;margin:0;text-transform:uppercase;letter-spacing:0.5px;">' + graphPeriodLabel(graphPeriods.foodWaste) + ' Food Waste In (KG)</h3>' +
    '<div style="display:flex;gap:8px;">' + graphPeriodButton('foodWaste','daily') + graphPeriodButton('foodWaste','monthly') + graphPeriodButton('foodWaste','yearly') + '</div></div>' +
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
  try { const data = await window.BSF_API.getFoodWaste({period:graphPeriods.foodWaste}); foodWasteData = data && (data.items || data.list) ? (data.items || data.list) : (Array.isArray(data) ? data : []); }
  catch(error){ foodWasteData = []; }
  renderFoodWasteChart();
}

function setGraphPeriod(chartId, period){
  if(!graphPeriods[chartId]) return;
  graphPeriods[chartId] = period === 'daily' || period === 'yearly' ? period : 'monthly';
  if(chartId === 'foodWaste') loadFoodWasteChart();
  else renderGraphs(document.getElementById('page-content'));
}

function renderGraphs(container){
  const chartData = rawDataRows.slice(0,100).reverse().map(function(row,i){
    return { day:i+1, date:row.recordedAt, waste:null, temp:Number(row.temperature), energy:null, ghg:null, humidity:Number(row.humidity) };
  });
  const ghgSeries = aggregateGraphSeries(chartData, 'ghg', graphPeriods.ghg);
  const tempSeries = aggregateGraphSeries(chartData, 'temp', graphPeriods.temp);
  const energySeries = aggregateGraphSeries(chartData, 'energy', graphPeriods.energy);

  function lineChart(data, key, color, unit, chartId){
    const period = graphPeriods[chartId] || 'monthly';
    const validValues = data.map(function(row){ return row[key]; }).filter(function(value){ return value !== null && value !== undefined && Number.isFinite(Number(value)); }).map(Number);
    const avgValue = validValues.length ? (validValues.reduce(function(a,b){ return a+b; },0) / validValues.length).toFixed(1) : '—';
    return '<div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0;text-transform:uppercase;letter-spacing:0.5px;">' + graphPeriodLabel(period) + ' ' + key + ' Trend' + (validValues.length ? '' : ' · No data source') + '</h3>' +
      '<div style="display:flex;gap:8px;">' + graphPeriodButton(chartId,'daily') + graphPeriodButton(chartId,'monthly') + graphPeriodButton(chartId,'yearly') + '</div></div>' +
      buildBarChartSvg(data, key, color) +
      '<div style="display:flex;justify-content:space-between;margin-top:8px;"><span style="font-size:12px;color:#64748b;">Unit: ' + unit + '</span><span style="font-size:12px;color:#64748b;">Avg: ' + avgValue + ' ' + unit + '</span></div></div>';
  }

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Data Analytics</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Visualize trends across temperature, humidity, weight, energy and carbon reduction</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      <input type="date" value="${rawDataRows.length ? rawDataRows[rawDataRows.length-1].recordedAt.slice(0,10) : ''}" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      <span style="color:#64748b;display:flex;align-items:center;">to</span>
      <input type="date" value="${rawDataRows.length ? rawDataRows[0].recordedAt.slice(0,10) : ''}" style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
      <select style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">${devices.map(function(dev){ return '<option>' + dev.id + '</option>'; }).join('')}</select>
      <button style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Apply</button>
      <button style="padding:10px 20px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-weight:600;font-size:14px;cursor:pointer;">Export CSV</button>
    </div>
    ${foodWasteChartMarkup()}
    ${lineChart(ghgSeries, 'ghg', '#10b981', 'kg CO₂e', 'ghg')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${lineChart(tempSeries, 'temp', '#f97316', '°C', 'temp')}
      ${lineChart(energySeries, 'energy', '#ef4444', 'kWh', 'energy')}
    </div>
  `;
  loadFoodWasteChart();
}
