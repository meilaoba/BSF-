let currentRole = 'admin';
let currentPage = 'machines';
let currentUsername = '';
let currentClient = '';
let machineFilters = { client: '', device: '' };
let rawDataFilters = { client: '', device: '', start: '', end: '' };
let rawDataPage = 1;
const RAW_DATA_PAGE_SIZE = 30;
let alertFilters = { client: '', machine: '' };
let apiFilters = { client: '', machine: '' };
let machineThresholds = {};
let alertNotifications = [];
const GOOGLE_MAPS_API_KEY = '';
let locationsMap = null;
let googleMapsLoading = null;

function isClientScopedRole(){
  return currentRole === 'client-admin' || currentRole === 'user';
}

function resolveClientForCurrentUser(){
  const profile = window.BSF_USER_PROFILE || window.BSF_CURRENT_USER || {};
  if(profile.client) return profile.client;
  if(window.BSF_CURRENT_CLIENT) return window.BSF_CURRENT_CLIENT;
  if(typeof userRecords !== 'undefined' && Array.isArray(userRecords)){
    const record = userRecords.find(function(user){ return user.username === currentUsername || user.email === currentUsername; });
    if(record && record.client) return record.client;
  }
  const assigned = devices.find(function(device){ return device.client && device.client !== 'Unassigned'; });
  return assigned ? assigned.client : 'Unassigned';
}

function refreshClientScope(){
  if(!isClientScopedRole()){ currentClient = ''; return ''; }
  currentClient = resolveClientForCurrentUser();
  return currentClient;
}

function scopedClientNames(){
  refreshClientScope();
  const names = Array.from(new Set(devices.map(function(device){ return device.client || 'Unassigned'; })));
  return isClientScopedRole() ? names.filter(function(name){ return name === currentClient; }) : names;
}

function scopedDevices(){
  const client = refreshClientScope();
  return isClientScopedRole() ? devices.filter(function(device){ return (device.client || 'Unassigned') === client; }) : devices;
}

function applyClientScopeToState(){
  const client = refreshClientScope();
  if(!isClientScopedRole()) return;
  machineFilters.client = client; machineFilters.device = '';
  rawDataFilters.client = client; rawDataFilters.device = '';
  alertFilters.client = client; alertFilters.machine = '';
  apiFilters.client = client; apiFilters.machine = '';
  if(typeof graphFilters !== 'undefined'){ graphFilters.client = client; graphFilters.machine = ''; }
  if(typeof reportFilters !== 'undefined'){ reportFilters.client = client; reportFilters.device = ''; }
}

function clientScopeName(){
  const client = refreshClientScope() || 'Unassigned';
  return String(client).replace(/[&<>"']/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

function clientScopeBadge(){
  if(!isClientScopedRole()) return '';
  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-left:3px solid #10b981;border-radius:8px;color:#e2e8f0;font-size:13px;min-width:210px;"><span style="color:#94a3b8;font-weight:600;">Current Client</span><strong style="color:#10b981;">' + clientScopeName() + '</strong></div>';
}

const navItems = {
  admin: [
    {id:'machines',label:'Machines',icon:'⚙️'},
    {id:'locations',label:'Locations',icon:'📍'},
    {id:'graphs',label:'Graphs',icon:'📊'},
    {id:'raw-data',label:'Raw Data',icon:'📋'},
    {id:'reports',label:'Report Generation',icon:'📄'},
    {id:'clients',label:'Clients',icon:'🏢'},
    {id:'users',label:'Users',icon:'👥'},
    {id:'alerts',label:'Alerts',icon:'🚨'},
    {id:'system',label:'System Settings',icon:'🔧'},
    {id:'logs',label:'Logs',icon:'📝'},
    {id:'api',label:'API / Data Sources',icon:'🔌'}
  ],
  'client-admin': [
    {id:'machines',label:'Machines',icon:'⚙️'},
    {id:'locations',label:'Locations',icon:'📍'},
    {id:'graphs',label:'Graphs',icon:'📊'},
    {id:'raw-data',label:'Raw Data',icon:'📋'},
    {id:'reports',label:'Report Generation',icon:'📄'},
    {id:'users',label:'Users',icon:'👥'},
    {id:'alerts',label:'Alerts',icon:'🚨'},
    {id:'account',label:'Account / Settings',icon:'👤'}
  ],
  user: [
    {id:'machines',label:'Machines',icon:'⚙️'},
    {id:'locations',label:'Locations',icon:'📍'},
    {id:'graphs',label:'Graphs',icon:'📊'},
    {id:'raw-data',label:'Raw Data',icon:'📋'},
    {id:'reports',label:'Report Generation',icon:'📄'},
    {id:'alerts',label:'Alerts',icon:'🚨'},
    {id:'account',label:'Account / Settings',icon:'👤'}
  ]
};
