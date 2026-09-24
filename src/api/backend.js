import { createHttpClient } from './http.js';

export function createBackendApi(options = {}) {
  const http = options.http || createHttpClient({
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs || 15000,
    getToken: options.getToken
  });

  return {
    login(data) { return http.post('/auth/login', data); },
    getProfile() { return http.get('/auth/profile'); },

    getClients(params) { return http.get('/clients', params); },
    createClient(data) { return http.post('/clients', data); },
    updateClient(id, data) { return http.put('/clients/' + encodeURIComponent(id), data); },
    deleteClient(id) { return http.delete('/clients/' + encodeURIComponent(id)); },

    getMachines(params) { return http.get('/machines', params); },
    getMachineMetrics(id, params) { return http.get('/machines/' + encodeURIComponent(id) + '/metrics', params); },
    restartMachine(id) { return http.post('/devices/' + encodeURIComponent(id) + '/restart'); },
    getLocations(params) { return http.get('/locations', params); },
    getGraphs(params) { return http.get('/graphs', params); },
    getFoodWaste(params) { return http.get('/graphs/food-waste', params); },
    getRawData(params) { return http.get('/raw-data', params); },
    getReports(params) { return http.get('/reports', params); },

    getAlerts(params) { return http.get('/alerts', params); },
    getNotifications(params) { return http.get('/notifications', params); },
    markNotificationRead(id) { return http.put('/notifications/' + encodeURIComponent(id) + '/read'); },
    markAllNotificationsRead() { return http.put('/notifications/read-all'); },
    saveAlertThresholds(data) { return http.put('/alerts/thresholds', data); },
    sendAlertNotification(data) { return http.post('/notifications/alert', data); },
    sendWhatsAppNotification(data) { return http.post('/notifications/whatsapp', data); },

    getUsers(params) { return http.get('/users', params); },
    createUser(data) { return http.post('/users', data); },
    updateUser(id, data) { return http.put('/users/' + encodeURIComponent(id), data); },
    deleteUser(id) { return http.delete('/users/' + encodeURIComponent(id)); },
    getRoles(params) { return http.get('/roles', params); },
    createRole(data) { return http.post('/roles', data); },
    updateRole(id, data) { return http.put('/roles/' + encodeURIComponent(id), data); },
    deleteRole(id) { return http.delete('/roles/' + encodeURIComponent(id)); },

    getSystemSettings(params) { return http.get('/settings', params); },
    saveSystemSettings(data) { return http.put('/settings', data); },
    getLogs(params) { return http.get('/logs', params); },
    getDataSources(params) { return http.get('/data-sources', params); },
    getAccount() { return http.get('/account'); },
    updateAccount(data) { return http.put('/account', data); }
  };
}
