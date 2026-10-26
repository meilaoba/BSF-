const LOGIN_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Incorrect username or password. Please try again.',
  LOGIN_RATE_LIMITED: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  ACCOUNT_DISABLED: 'This account is currently disabled. Please contact the system administrator.',
  ACCOUNT_TYPE_NOT_SUPPORTED: 'This account is not enabled for the monitoring platform. Please contact the system administrator.',
  UNSUPPORTED_ACCOUNT_TYPE: 'This account is not enabled for the monitoring platform. Please contact the system administrator.',
  AUTH_SERVICE_TIMEOUT: 'The sign-in service is taking too long to respond. Please try again.',
  AUTH_SERVICE_UNAVAILABLE: 'The sign-in service is temporarily unavailable. Please try again shortly.',
  AUTH_NOT_CONFIGURED: 'The sign-in service is not configured yet. Please contact the system administrator.',
  TIMEOUT: 'The sign-in request timed out. Please try again.'
};

function friendlyLoginError(error){
  if(error && error.code && LOGIN_ERROR_MESSAGES[error.code]) return LOGIN_ERROR_MESSAGES[error.code];
  if(error && error.message === 'Account role is not configured') return 'This account has no platform role assigned. Please contact the system administrator.';
  if(error && error.code === 'NETWORK_ERROR') return 'Unable to reach the sign-in service. Please check your connection and try again.';
  return 'Unable to sign in right now. Please try again or contact the system administrator.';
}

function setLoginError(message, field){
  const box = document.getElementById('login-error');
  const text = document.getElementById('login-error-text');
  if(!box || !text) return;
  text.textContent = message;
  box.style.display = 'flex';
  const target = field === 'username'
    ? document.getElementById('login-username')
    : field === 'password' ? document.getElementById('login-password') : null;
  if(target){
    target.setAttribute('aria-invalid', 'true');
    target.style.borderColor = '#ef4444';
  }
}

function clearLoginError(){
  const box = document.getElementById('login-error');
  if(box) box.style.display = 'none';
  const text = document.getElementById('login-error-text');
  if(text) text.textContent = '';
  ['login-username', 'login-password'].forEach(function(id){
    const input = document.getElementById(id);
    if(!input) return;
    input.removeAttribute('aria-invalid');
    input.style.borderColor = '#334155';
  });
}

function setLoginBusy(busy){
  const button = document.getElementById('login-submit');
  if(!button) return;
  button.disabled = Boolean(busy);
  button.style.opacity = busy ? '0.7' : '1';
  button.style.cursor = busy ? 'wait' : 'pointer';
  button.textContent = busy ? 'Signing In...' : 'Sign In';
}

function setPasswordEyeState(visible){
  const eye = document.getElementById('login-password-eye');
  const eyeOff = document.getElementById('login-password-eye-off');
  if(eye) eye.style.display = visible ? 'none' : 'block';
  if(eyeOff) eyeOff.style.display = visible ? 'block' : 'none';
}

function togglePasswordVisibility(){
  const input = document.getElementById('login-password');
  const button = document.getElementById('login-password-toggle');
  if(!input || !button) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  setPasswordEyeState(show);
  button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  button.setAttribute('aria-pressed', show ? 'true' : 'false');
  input.focus();
}

function resetLoginFormState(){
  const password = document.getElementById('login-password');
  const toggle = document.getElementById('login-password-toggle');
  if(password) password.value = '';
  if(password) password.type = 'password';
  setPasswordEyeState(false);
  if(toggle) toggle.setAttribute('aria-label', 'Show password');
  if(toggle) toggle.setAttribute('aria-pressed', 'false');
  setLoginBusy(false);
  clearLoginError();
}
let dataRefreshTimer = null;

function normalizeSessionRole(role){
  const value = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if(value === 'master_admin' || value === 'admin') return 'admin';
  if(value === 'client_admin') return 'client-admin';
  if(value === 'user') return 'user';
  return '';
}

async function authenticateLogin(userName, password){
  if(window.BSF_AUTH_CONFIG && window.BSF_AUTH_CONFIG.enabled){
    const session = await window.BSF_API.login({ userName: userName, password: password });
    window.BSF_SESSION = session || {};
    const resolvedRole = normalizeSessionRole(session && session.user && session.user.role);
    if(!resolvedRole) throw new Error('Account role is not configured');
    window.BSF_USER_PROFILE = session.user;
    window.BSF_CURRENT_USER = session.user;
    return {
      role: resolvedRole,
      username: session.user.userName || session.user.fullName || userName,
      user: session.user
    };
  }
  throw new Error('Authentication service unavailable');
}

async function enterAuthenticatedApp(authenticated){
  currentRole = authenticated.role;
  currentUsername = authenticated.username;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-app').style.display='block';
  const roleMeta = { admin:{label:'Master Admin'}, 'client-admin':{label:'Client Admin'}, user:{label:'User'} };
  const roleInfo = roleMeta[currentRole] || roleMeta.user;
  document.getElementById('role-badge').textContent = roleInfo.label;
  document.getElementById('user-name').textContent = authenticated.username;
  const initials = authenticated.username.replace(/@.*/, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || roleInfo.label.slice(0, 2).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  if(typeof applyStoredAccountProfile === 'function') applyStoredAccountProfile();
  renderNav();
  await loadDataForCurrentRole();
  applyClientScopeToState();
  scheduleDataRefresh();
  navigate('machines');
}

async function login(){
  const submit = document.getElementById('login-submit');
  if(submit && submit.disabled) return;
  clearLoginError();
  const loginName = String((document.getElementById('login-username') || {}).value || '').trim();
  const password = (document.getElementById('login-password') || {}).value || '';
  if(!loginName){ setLoginError('Enter your username or email address.', 'username'); return; }
  if(!password){ setLoginError('Enter your password.', 'password'); return; }

  setLoginBusy(true);
  let authenticated;
  try {
    authenticated = await authenticateLogin(loginName, password);
  } catch(error) {
    setLoginError(friendlyLoginError(error));
    setLoginBusy(false);
    return;
  }
  setLoginBusy(false);
  await enterAuthenticatedApp(authenticated);
}
async function loadDataForCurrentRole(){
  if(!window.BSF_LOAD_BACKEND_DATA) return false;
  const limit = currentRole === 'admin' ? 100 : 1;
  const loaded = await window.BSF_LOAD_BACKEND_DATA(limit);
  applyClientScopeToState();
  if(window.BSF_NOTIFICATIONS) window.BSF_NOTIFICATIONS.syncFromAlerts();
  return loaded;
}

async function loadLatestForCurrentRole(){
  if(!window.BSF_LOAD_BACKEND_LATEST) return false;
  const changed = await window.BSF_LOAD_BACKEND_LATEST();
  if(changed && window.BSF_NOTIFICATIONS) window.BSF_NOTIFICATIONS.syncFromAlerts();
  return changed;
}

async function refreshRealtimePage(){
  const realtimePages = ['machines','locations','graphs','raw-data','reports','alerts'];
  if(document.querySelector('[id$="-modal"]')) return;
  if(realtimePages.indexOf(currentPage) === -1) return;
  renderNav();
  navigate(currentPage);
}

function scheduleDataRefresh(){
  if(dataRefreshTimer) clearInterval(dataRefreshTimer);

  if(currentRole === 'admin'){
    // Master Admin checks the vendor API for fresh telemetry every 5 seconds.
    dataRefreshTimer = setInterval(async function(){
      const changed = await loadLatestForCurrentRole();
      if(changed) await refreshRealtimePage();
    }, 5000);
    return;
  }

  // Client Admin and User refresh the page every 10 minutes and show the nearest latest record.
  dataRefreshTimer = setInterval(async function(){
    await loadLatestForCurrentRole();
    await refreshRealtimePage();
  }, 10 * 60 * 1000);
}

async function logout(){
  if(dataRefreshTimer) clearInterval(dataRefreshTimer);
  dataRefreshTimer = null;
  if(window.BSF_AUTH_CONFIG && window.BSF_AUTH_CONFIG.enabled && window.BSF_API){
    try { await window.BSF_API.logout(); } catch (error) {}
  }
  try { sessionStorage.removeItem('bsf.delivery.sessionToken'); } catch (error) {}
  window.BSF_SESSION = null;
  window.BSF_USER_PROFILE = null;
  window.BSF_CURRENT_USER = null;
  currentUsername = '';
  currentClient = '';
  currentMachineId = '';
  document.getElementById('main-app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  resetLoginFormState();
}


async function restoreAuthenticatedSession(){
  if(!window.BSF_AUTH_CONFIG || !window.BSF_AUTH_CONFIG.enabled || !window.BSF_API) return;
  try {
    const session = await window.BSF_API.getSession();
    if(!session || !session.user) return;
    window.BSF_SESSION = session;
    window.BSF_USER_PROFILE = session.user;
    window.BSF_CURRENT_USER = session.user;
    const resolvedRole = normalizeSessionRole(session.user.role);
    if(!resolvedRole) throw new Error('Account role is not configured');
    await enterAuthenticatedApp({
      role: resolvedRole,
      username: session.user.userName || session.user.fullName || 'User',
      user: session.user
    });
  } catch (error) {}
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

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){ restoreAuthenticatedSession(); }, { once:true });
} else {
  setTimeout(function(){ restoreAuthenticatedSession(); }, 0);
}
