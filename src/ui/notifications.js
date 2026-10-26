let notificationRecords = [];
const NOTIFICATION_READ_KEY = 'bsf.delivery.notificationReadIds';

function notificationReadIds(){
  try { return JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || '[]'); } catch(e) { return []; }
}

function persistNotificationReadIds(ids){
  try { localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(ids)); } catch(e) {}
}


function notificationItemFromAlert(alert, index){
  const id = alert.id || ('alert-' + index + '-' + (alert.time || '') + '-' + (alert.type || ''));
  return {
    id:String(id),
    title:alert.type || 'Alert',
    detail:(alert.device || 'Device') + ' · ' + (alert.value || '—'),
    time:alert.time || '',
    device:alert.device || '',
    read:false
  };
}

function syncFromAlerts(){
  const readIds = notificationReadIds();
  const source = Array.isArray(alerts) ? alerts : [];
  notificationRecords = source.map(notificationItemFromAlert).map(function(item){
    item.read = readIds.indexOf(item.id) >= 0;
    return item;
  });
  if(devices && devices.length){
    const systemId = 'backend-data-loaded';
    notificationRecords.unshift({
      id:systemId,
      title:'Data source connected',
      detail:(devices[0].id || 'Device') + ' data loaded',
      time:typeof bsfFormatTime === 'function' ? bsfFormatTime(Date.now() / 1000) : new Date().toLocaleString(),
      device:devices[0].id || '',
      read:readIds.indexOf(systemId) >= 0
    });
  }
  renderNotificationBadge();
  renderNotificationPanel();
}

function notificationPanel(){
  return document.getElementById('notification-panel');
}

function ensureNotificationPanel(){
  let panel = notificationPanel();
  if(panel) return panel;
  const bell = document.getElementById('notification-bell');
  if(!bell) return null;
  panel = document.createElement('div');
  panel.id = 'notification-panel';
  panel.style.cssText = 'display:none;position:absolute;top:34px;right:0;width:340px;max-height:420px;overflow:auto;background:#1e293b;border:1px solid #334155;border-radius:12px;box-shadow:0 20px 45px rgba(0,0,0,.45);z-index:200;';
  bell.parentNode.appendChild(panel);
  return panel;
}

function renderNotificationBadge(){
  const badge = document.getElementById('notification-badge');
  if(!badge) return;
  const count = notificationRecords.filter(function(item){ return !item.read; }).length;
  badge.textContent = String(count);
  badge.style.display = count ? 'flex' : 'none';
}

function notificationText(tagName, text, cssText){
  const element = document.createElement(tagName);
  element.textContent = String(text === null || text === undefined ? '' : text);
  if(cssText) element.style.cssText = cssText;
  return element;
}

function renderNotificationPanel(){
  const panel = ensureNotificationPanel();
  if(!panel) return;
  panel.replaceChildren();
  const unread = notificationRecords.filter(function(item){ return !item.read; }).length;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #334155;';
  const heading = document.createElement('div');
  heading.appendChild(notificationText('b', 'Notifications', 'color:#f8fafc;font-size:14px;'));
  heading.appendChild(notificationText('span', unread + ' unread', 'margin-left:8px;color:#64748b;font-size:12px;'));
  header.appendChild(heading);
  if(unread){
    const markAll = notificationText('button', 'Mark all read', 'background:none;border:none;color:#10b981;font-size:12px;cursor:pointer;');
    markAll.type = 'button';
    markAll.addEventListener('click', markAllNotificationsRead);
    header.appendChild(markAll);
  }
  panel.appendChild(header);

  if(!notificationRecords.length){
    panel.appendChild(notificationText('div', 'No notifications', 'padding:30px 16px;text-align:center;color:#64748b;font-size:13px;'));
    return;
  }

  notificationRecords.forEach(function(item){
    const row = document.createElement('div');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.style.cssText = 'display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid #334155;cursor:pointer;background:' + (item.read ? '#1e293b' : 'rgba(16,185,129,.06)') + ';';
    const dot = document.createElement('span');
    dot.style.cssText = 'width:8px;height:8px;margin-top:6px;border-radius:50%;background:' + (item.read ? '#475569' : '#ef4444') + ';flex:none;';
    row.appendChild(dot);
    const body = document.createElement('div');
    body.style.cssText = 'min-width:0;';
    body.appendChild(notificationText('div', item.title, 'font-size:13px;font-weight:600;color:#f8fafc;'));
    body.appendChild(notificationText('div', item.detail, 'font-size:12px;color:#94a3b8;margin-top:4px;'));
    body.appendChild(notificationText('div', item.time, 'font-size:11px;color:#64748b;margin-top:4px;'));
    row.appendChild(body);
    const activate = function(event){
      if(event && event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if(event && event.type === 'keydown') event.preventDefault();
      openNotification(item.id);
    };
    row.addEventListener('click', activate);
    row.addEventListener('keydown', activate);
    panel.appendChild(row);
  });
}
function toggleNotificationPanel(event){
  if(event) event.stopPropagation();
  const panel = ensureNotificationPanel();
  if(!panel) return;
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function openNotification(id){
  const item = notificationRecords.find(function(record){ return String(record.id) === String(id); });
  if(item && !item.read){
    item.read = true;
    const ids = notificationReadIds();
    if(ids.indexOf(id) < 0) ids.push(id);
    persistNotificationReadIds(ids);
    renderNotificationBadge();
    renderNotificationPanel();
  }
  const panel = notificationPanel();
  if(panel) panel.style.display = 'none';
  if(typeof navigate === 'function') navigate('alerts');
}

function markAllNotificationsRead(){
  const ids = notificationReadIds();
  notificationRecords.forEach(function(item){ item.read = true; if(ids.indexOf(item.id) < 0) ids.push(item.id); });
  persistNotificationReadIds(ids);
  renderNotificationBadge();
  renderNotificationPanel();
}

document.addEventListener('click', function(){ const panel = notificationPanel(); if(panel) panel.style.display = 'none'; });
document.addEventListener('DOMContentLoaded', function(){ ensureNotificationPanel(); syncFromAlerts(); });

function addNotification(record){
  const item = Object.assign({ id:'notification-' + Date.now(), title:'Notification', detail:'', time:new Date().toLocaleString(), device:'', read:false }, record || {});
  item.id = String(item.id);
  notificationRecords.unshift(item);
  renderNotificationBadge();
  renderNotificationPanel();
  return item;
}

window.BSF_NOTIFICATIONS = {
  syncFromAlerts: syncFromAlerts,
  toggle: toggleNotificationPanel,
  render: renderNotificationPanel,
  add: addNotification
};
window.toggleNotificationPanel = toggleNotificationPanel;
window.openNotification = openNotification;
window.markAllNotificationsRead = markAllNotificationsRead;
