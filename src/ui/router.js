function syncLoginRole(){
  const role = (document.getElementById('role-select') || {}).value || 'admin';
  const defaults = { admin:'admin@platform.hk', 'client-admin':'client@platform.hk', user:'user@platform.hk' };
  const input = document.getElementById('login-username');
  if(input) input.value = defaults[role] || defaults.user;
}

let dataRefreshTimer = null;

function normalizeSessionRole(role){
  const value = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if(value === 'master_admin' || value === 'admin') return 'admin';
  if(value === 'client_admin') return 'client-admin';
  if(value === 'user') return 'user';
  return '';
}

function isLocalDevelopmentHost(){
  return ['localhost', '127.0.0.1', '::1'].indexOf(window.location.hostname) >= 0;
}

async function authenticateLogin(email, password){
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    const session = await window.BSF_API.login({ email: email, password: password });
    const token = session && (session.token || session.accessToken);
    if(token){
      try { sessionStorage.setItem('bsf.delivery.sessionToken', String(token)); } catch (error) {}
    }
    window.BSF_SESSION = session || {};
    const resolvedRole = normalizeSessionRole(session && (session.role || (session.user && session.user.role)));
    if(!resolvedRole) throw new Error('Account role is not configured');
    return { role: resolvedRole, username: (session.user && (session.user.email || session.user.name)) || email };
  }
  if(!isLocalDevelopmentHost()) throw new Error('Authentication service unavailable');
  const demoRole = document.getElementById('role-select').value;
  if(!demoRole) throw new Error('Please select a role');
  return { role: demoRole, username: email };
}

async function login(){
  const loginName = (document.getElementById('login-username') || {}).value || '';
  const password = (document.getElementById('login-password') || {}).value || '';
  if(!loginName || !password){ alert('Email and password are required.'); return; }
  let authenticated;
  try { authenticated = await authenticateLogin(loginName, password); }
  catch(error){ alert('Sign in failed: ' + error.message); return; }
  currentRole = authenticated.role;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-app').style.display='block';
  const roleMeta = { admin:{label:'Master Admin'}, 'client-admin':{label:'Client Admin'}, user:{label:'User'} };
  const roleInfo = roleMeta[currentRole] || roleMeta.user;
  document.getElementById('role-badge').textContent = roleInfo.label;
  document.getElementById('user-name').textContent = loginName;
  const initials = loginName.replace(/@.*/, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || roleInfo.label.slice(0, 2).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  if(typeof applyStoredAccountProfile === 'function') applyStoredAccountProfile();
  renderNav();
  await loadDataForCurrentRole();
  applyClientScopeToState();
  scheduleDataRefresh();
  navigate('machines');
}

async function loadDataForCurrentRole(){
  if(!window.BSF_LOAD_GATEWAY_DATA) return false;
  const limit = currentRole === 'admin' ? 100 : 1;
  const loaded = await window.BSF_LOAD_GATEWAY_DATA(limit);
  applyClientScopeToState();
  if(window.BSF_NOTIFICATIONS) window.BSF_NOTIFICATIONS.syncFromAlerts();
  return loaded;
}

async function loadLatestForCurrentRole(){
  if(!window.BSF_LOAD_GATEWAY_LATEST) return false;
  const changed = await window.BSF_LOAD_GATEWAY_LATEST();
  if(changed && window.BSF_NOTIFICATIONS) window.BSF_NOTIFICATIONS.syncFromAlerts();
  return changed;
}

function scheduleDataRefresh(){
  if(dataRefreshTimer) clearInterval(dataRefreshTimer);
  const realtimePages = ['machines','locations','graphs','raw-data','reports','alerts'];
  dataRefreshTimer = setInterval(async function(){
    const changed = await loadLatestForCurrentRole();
    if(!changed) return;
    if(document.querySelector('[id$="-modal"]')) return;
    if(realtimePages.indexOf(currentPage) === -1) return;
    renderNav();
    navigate(currentPage);
  }, 5000);
}

function logout(){
  if(dataRefreshTimer) clearInterval(dataRefreshTimer);
  dataRefreshTimer = null;
  try { sessionStorage.removeItem('bsf.delivery.sessionToken'); } catch (error) {}
  window.BSF_SESSION = null;
  currentUsername = '';
  currentClient = '';
  currentMachineId = '';
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
    <p style="font-size:12px;color:#94a3b8;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${bsfEscapeHtml(title)}</p>
    <p style="font-size:28px;font-weight:700;color:${color||'#f8fafc'};margin:0;">${bsfEscapeHtml(value)}<span style="font-size:14px;color:#64748b;margin-left:4px;font-weight:500;">${bsfEscapeHtml(unit||'')}</span></p>
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
