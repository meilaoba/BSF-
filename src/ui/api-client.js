/* Classic API bootstrap.
 * The page still ships an ES-module entrypoint, but critical authenticated
 * requests must also work when a browser or embedded webview does not execute
 * module scripts reliably. This file is loaded before the classic UI modules.
 */
(function(){
  'use strict';

  const API_STORAGE_KEY = 'bsf.delivery.apiBaseUrl';
  const DEFAULT_RUNTIME_CONFIG = {
    apiBaseUrl:'/api/v1',
    requestTimeoutMs:15000,
    humidityScale:100,
    refreshMs:{ admin:30 * 60 * 1000, clientAdmin:30 * 60 * 1000, user:30 * 60 * 1000 }
  };

  function normalizeApiBaseUrl(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    try {
      const parsed = new URL(raw, window.location.origin);
      if(parsed.origin !== window.location.origin) return '';
      if(parsed.pathname !== '/api/v1' && !parsed.pathname.startsWith('/api/v1/')) return '';
      return parsed.pathname.replace(/\/+$/, '');
    } catch(error) {
      return '';
    }
  }

  function storedApiBaseUrl(){
    try {
      const stored = window.localStorage && window.localStorage.getItem(API_STORAGE_KEY);
      const clean = normalizeApiBaseUrl(stored);
      if(stored && !clean && window.localStorage) window.localStorage.removeItem(API_STORAGE_KEY);
      return clean;
    } catch(error) {
      return '';
    }
  }
  class BsfApiError extends Error {
    constructor(message, code, details){
      super(message);
      this.name = 'BsfApiError';
      this.code = code;
      this.details = details;
    }
  }

  function buildQuery(params){
    const pairs = [];
    Object.keys(params || {}).forEach(function(key){
      const value = params[key];
      if(value !== undefined && value !== null && value !== '') {
        pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
      }
    });
    return pairs.length ? '?' + pairs.join('&') : '';
  }

  function readCookie(name){
    const prefix = name + '=';
    const entry = String(document.cookie || '').split(';').map(function(part){ return part.trim(); })
      .find(function(part){ return part.startsWith(prefix); });
    if(!entry) return '';
    try { return decodeURIComponent(entry.slice(prefix.length)); }
    catch(error) { return ''; }
  }

  const runtime = Object.assign({}, DEFAULT_RUNTIME_CONFIG, {
    apiBaseUrl:storedApiBaseUrl() || DEFAULT_RUNTIME_CONFIG.apiBaseUrl
  });
  let sessionRefreshPromise = null;

  function refreshVendorSession(){
    if(sessionRefreshPromise) return sessionRefreshPromise;
    sessionRefreshPromise = request('/auth/refresh', { method:'POST', data:{} }, false)
      .finally(function(){ sessionRefreshPromise = null; });
    return sessionRefreshPromise;
  }

  async function request(path, options, allowRefresh){
    const settings = options || {};
    const canRefresh = allowRefresh !== false;
    const controller = new AbortController();
    const timer = setTimeout(function(){ controller.abort(); }, runtime.requestTimeoutMs);
    const method = settings.method || 'GET';
    const csrfToken = method === 'GET' || method === 'HEAD' ? '' : readCookie('bsf_csrf');
    const url = runtime.apiBaseUrl + path + buildQuery(settings.params);

    try {
      const response = await fetch(url, {
        method:method,
        credentials:'include',
        headers:Object.assign(
          settings.data === undefined ? {} : { 'Content-Type':'application/json' },
          csrfToken ? { 'X-CSRF-Token':csrfToken } : {},
          settings.headers || {}
        ),
        body:settings.data === undefined ? undefined : JSON.stringify(settings.data),
        signal:controller.signal
      });
      const payload = await response.json().catch(function(){ return {}; });
      if(!response.ok){
        const apiError = payload && payload.error ? payload.error : {};
        const error = new BsfApiError(
          apiError.message || payload.message || ('HTTP ' + response.status),
          apiError.code || response.status,
          payload
        );
        if(canRefresh && path !== '/auth/refresh' && error.code === 'VENDOR_SESSION_EXPIRED'){
          await refreshVendorSession();
          return request(path, settings, false);
        }
        throw error;
      }
      if(payload && typeof payload === 'object' && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
      if(payload && typeof payload === 'object' && 'code' in payload){
        if(payload.code === 0 || payload.code === 200) return payload.data;
        throw new BsfApiError(payload.msg || payload.message || 'API_ERROR', payload.code, payload.data);
      }
      return payload;
    } catch(error) {
      if(error && error.name === 'AbortError') throw new BsfApiError('Request timed out', 'TIMEOUT');
      if(!(error instanceof BsfApiError)) throw new BsfApiError('Unable to reach the API service', 'NETWORK_ERROR');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function get(path, params){ return request(path, { params:params }); }
  function post(path, data){ return request(path, { method:'POST', data:data }); }
  function put(path, data){ return request(path, { method:'PUT', data:data }); }
  function del(path, data){ return request(path, { method:'DELETE', data:data }); }
  function idPath(base, id, suffix){ return base + '/' + encodeURIComponent(id) + (suffix || ''); }

  window.BSF_API = {
    request:request,
    health:function(){ return get('/health'); },
    login:function(data){ return post('/auth/login', data); },
    logout:function(){ return post('/auth/logout', {}); },
    getSession:function(){ return get('/auth/me'); },
    refreshSession:function(){ return post('/auth/refresh', {}); },
    getProfile:function(){ return get('/auth/profile'); },
    changePassword:function(data){ return post('/auth/change-password', data); },
    getClients:function(params){ return get('/clients', params); },
    createClient:function(data){ return post('/clients', data); },
    updateClient:function(id, data){ return put(idPath('/clients', id), data); },
    deleteClient:function(id){ return del(idPath('/clients', id)); },
    getMachines:function(params){ return get('/machines', params); },
    getVendorDevices:function(params){ return get('/vendor-devices', params); },
    getVendorHistory:function(params){ return get('/vendor-devices/history', params); },
    getMachineMetrics:function(id, params){ return get(idPath('/machines', id, '/metrics'), params); },
    updateMachine:function(id, data){ return put(idPath('/machines', id), data); },
    deactivateMachine:function(id){ return post(idPath('/machines', id, '/deactivate'), {}); },
    reactivateMachine:function(id){ return post(idPath('/machines', id, '/reactivate'), {}); },
    restartMachine:function(id){ return post(idPath('/devices', id, '/restart'), {}); },
    getLocations:function(params){ return get('/locations', params); },
    getGraphs:function(params){ return get('/graphs', params); },
    getFoodWaste:function(params){ return get('/graphs/food-waste', params); },
    getEnvironmentTemperature:function(params){ return get('/environment-temperature', params); },
    getDeviceData:function(params){ return get('/device-data', params); },
    getRawData:function(params){ return get('/device-data', params); },
    getRawSamples:function(params){ return get('/raw-data-samples', params); },
    getReports:function(params){ return get('/reports', params); },
    getAlerts:function(params){ return get('/alerts', params); },
    getNotifications:function(params){ return get('/notifications', params); },
    markNotificationRead:function(id){ return put(idPath('/notifications', id, '/read')); },
    markAllNotificationsRead:function(){ return put('/notifications/read-all'); },
    saveAlertThresholds:function(data){ return put('/alerts/thresholds', data); },
    sendAlertNotification:function(data){ return post('/notifications/alert', data); },
    sendWhatsAppNotification:function(data){ return post('/notifications/whatsapp', data); },
    getUsers:function(params){ return get('/users', params); },
    createUser:function(data){ return post('/users', data); },
    updateUser:function(id, data){ return put(idPath('/users', id), data); },
    deleteUser:function(id){ return del(idPath('/users', id)); },
    getRoles:function(params){ return get('/roles', params); },
    createRole:function(data){ return post('/roles', data); },
    updateRole:function(id, data){ return put(idPath('/roles', id), data); },
    deleteRole:function(id){ return del(idPath('/roles', id)); },
    getSystemSettings:function(params){ return get('/settings', params); },
    saveSystemSettings:function(data){ return put('/settings', data); },
    getLogs:function(params){ return get('/logs', params); },
    getDataSources:function(params){ return get('/data-sources', params); },
    getAccount:function(){ return get('/account'); },
    updateAccount:function(data){ return put('/account', data); }
  };

  window.BSF_RUNTIME_CONFIG = runtime;
  window.BSF_API_CONFIG = { baseUrl:runtime.apiBaseUrl, enabled:true, timeout:runtime.requestTimeoutMs };
  window.BSF_AUTH_CONFIG = { baseUrl:runtime.apiBaseUrl, enabled:true, timeout:runtime.requestTimeoutMs };
  window.dispatchEvent(new Event('bsf:api-ready'));
})();
