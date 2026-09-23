let dataRefreshTimer = null;

async function login(){
  currentRole = document.getElementById('role-select').value;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-app').style.display='block';
  document.getElementById('role-badge').textContent = currentRole === 'admin' ? 'Master Admin' : currentRole === 'client-admin' ? 'Client Admin' : 'User';
  if(currentRole === 'admin') document.getElementById('client-name').textContent = 'All Clients';
  else if(currentRole === 'client-admin') document.getElementById('client-name').textContent = 'GreenCity Solutions Ltd';
  else document.getElementById('client-name').textContent = 'GreenCity Solutions Ltd';
  renderNav();
  await loadDataForCurrentRole();
  scheduleDataRefresh();
  navigate('machines');
}

async function loadDataForCurrentRole(){
  if(!window.BSF_LOAD_GATEWAY_DATA) return false;
  const limit = currentRole === 'admin' ? 100 : 1;
  return window.BSF_LOAD_GATEWAY_DATA(limit);
}

function scheduleDataRefresh(){
  if(dataRefreshTimer) clearInterval(dataRefreshTimer);
  const interval = currentRole === 'admin' ? 3 * 60 * 1000 : 10 * 60 * 1000;
  dataRefreshTimer = setInterval(async function(){
    await loadDataForCurrentRole();
    renderNav();
    navigate(currentPage);
  }, interval);
}

function logout(){
  if(dataRefreshTimer) clearInterval(dataRefreshTimer);
  dataRefreshTimer = null;
  document.getElementById('main-app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
}

function renderNav(){
  const menu = document.getElementById('nav-menu');
  const items = navItems[currentRole];
  menu.innerHTML = items.map(item => `
    <a href="#" onclick="navigate('${item.id}');return false;" 
       style="display:flex;align-items:center;gap:12px;padding:12px 20px;color:${currentPage===item.id?'#10b981':'#94a3b8'};text-decoration:none;font-size:14px;font-weight:500;border-left:3px solid ${currentPage===item.id?'#10b981':'transparent'};background:${currentPage===item.id?'rgba(16,185,129,0.08)':'transparent'};transition:all 0.15s;"
       onmouseover="this.style.color='#e2e8f0';this.style.background='rgba(255,255,255,0.03)'"
       onmouseout="this.style.color='${currentPage===item.id?'#10b981':'#94a3b8'}';this.style.background='${currentPage===item.id?'rgba(16,185,129,0.08)':'transparent'}'">
      <span style="font-size:18px;width:24px;text-align:center;">${item.icon}</span>
      ${item.label}
    </a>
  `).join('');
}

function navigate(page){
  currentPage = page;
  renderNav();
  const content = document.getElementById('page-content');
  switch(page){
    case 'machines': renderMachines(content); break;
    case 'locations': renderLocations(content); break;
    case 'graphs': renderGraphs(content); break;
    case 'raw-data': renderRawData(content); break;
    case 'reports': renderReports(content); break;
    case 'clients': renderClients(content); break;
    case 'users': renderUsers(content); break;
    case 'alerts': renderAlerts(content); break;
    case 'system': renderSystem(content); break;
    case 'logs': renderLogs(content); break;
    case 'api': renderApi(content); break;
    case 'account': renderAccount(content); break;
  }
}

function card(title, value, unit, color){
  return `<div style="background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;">
    <p style="font-size:12px;color:#94a3b8;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${title}</p>
    <p style="font-size:28px;font-weight:700;color:${color||'#f8fafc'};margin:0;">${value}<span style="font-size:14px;color:#64748b;margin-left:4px;font-weight:500;">${unit||''}</span></p>
  </div>`;
}

/* =========================================================
   后端 API 预留层
   ---------------------------------------------------------
   当前页面仍使用原型数据，不改变现有界面。
   后端接入时：
   1. 设置 API_CONFIG.baseUrl
   2. 设置 API_CONFIG.enabled = true
   3. 页面通过 BSF_API.* 获取或保存数据
   ========================================================= */
