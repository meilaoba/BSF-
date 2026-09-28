let clientRecords = [];

function clientEscape(value){
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

function clientMachineName(deviceId){
  const device = devices.find(function(item){ return item.id === deviceId; });
  return device && device.client && device.client !== 'Unassigned' ? device.client : 'Unassigned';
}

function clientMachineIds(clientName){
  return devices.filter(function(device){ return device.client === clientName; }).map(function(device){ return device.id; });
}

function clientUnassignedDevices(){
  return devices.filter(function(device){ return !device.client || device.client === 'Unassigned'; });
}

function clientLinkedUsers(clientName){
  return userRecords.filter(function(user){ return user.client === clientName; });
}

function machineLinkedUsers(deviceId){
  const clientName = clientMachineName(deviceId);
  return userRecords.filter(function(user){
    return user.machineId === deviceId || (!user.machineId && user.client === clientName);
  });
}

function clientAssignMachine(deviceId, clientName){
  const normalized = clientName && clientName !== 'Unassigned' ? clientName : 'Unassigned';
  const device = devices.find(function(item){ return item.id === deviceId; });
  if(device) device.client = normalized;
  clientRecords.forEach(function(client){
    const ids = new Set(client.machineIds || []);
    if(normalized !== 'Unassigned' && client.name === normalized) ids.add(deviceId);
    else ids.delete(deviceId);
    client.machineIds = Array.from(ids);
  });
}

function clientMachineChips(deviceIds){
  if(!deviceIds.length) return '<span style="color:#64748b;">No machines linked</span>';
  return deviceIds.map(function(deviceId){
    return '<button onclick="openMachineAccount(\'' + clientEscape(deviceId) + '\')" style="padding:4px 9px;margin:2px;background:#0f172a;border:1px solid #475569;border-radius:12px;color:#e2e8f0;font-size:11px;cursor:pointer;">' + clientEscape(deviceId) + '</button>';
  }).join('');
}

function renderClients(container){
  const unassigned = clientUnassignedDevices();
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Client Management</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Manage clients, machine assignments and account access</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:18px;"><p style="margin:0 0 6px;color:#94a3b8;font-size:12px;font-weight:600;">REGISTERED CLIENTS</p><p style="margin:0;color:#f8fafc;font-size:26px;font-weight:700;">${clientRecords.length}</p></div>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:18px;"><p style="margin:0 0 6px;color:#94a3b8;font-size:12px;font-weight:600;">ASSIGNED MACHINES</p><p style="margin:0;color:#10b981;font-size:26px;font-weight:700;">${devices.length - unassigned.length}</p></div>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:18px;"><p style="margin:0 0 6px;color:#94a3b8;font-size:12px;font-weight:600;">UNASSIGNED MACHINES</p><p style="margin:0;color:${unassigned.length ? '#f59e0b' : '#10b981'};font-size:26px;font-weight:700;">${unassigned.length}</p></div>
    </div>
    ${unassigned.length ? '<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.45);border-radius:12px;padding:16px 18px;margin-bottom:20px;"><p style="margin:0 0 6px;color:#f59e0b;font-size:13px;font-weight:700;">Unassigned Machines</p><p style="margin:0 0 10px;color:#94a3b8;font-size:12px;">These machines have no company name until they are linked to a client.</p><div>' + clientMachineChips(unassigned.map(function(device){ return device.id; })) + '</div></div>' : ''}
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <button style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="openClientModal()">+ Add Client</button>
      <input type="text" placeholder="Search clients..." style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:260px;" />
    </div>
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#0f172a;border-bottom:1px solid #334155;">
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Client Name</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Linked Machines</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Users</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Status</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Actions</th>
        </tr></thead>
        <tbody>
          ${clientRecords.map(function(client, index){
            const machineIds = clientMachineIds(client.name);
            const users = clientLinkedUsers(client.name);
            return '<tr style="border-bottom:1px solid #334155;background:' + (index % 2 === 0 ? '#1e293b' : '#1a2332') + ';"><td style="padding:14px 20px;color:#f8fafc;font-weight:600;">' + clientEscape(client.name) + '</td><td style="padding:10px 16px;">' + clientMachineChips(machineIds) + '</td><td style="padding:14px 20px;color:#e2e8f0;">' + users.length + '</td><td style="padding:14px 20px;"><span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;">' + clientEscape(client.status || 'Active') + '</span></td><td style="padding:14px 20px;"><button onclick="openClientModal(' + index + ')" style="padding:6px 14px;background:#334155;border:none;border-radius:6px;color:#e2e8f0;font-size:12px;cursor:pointer;margin-right:6px;">Edit</button><button style="padding:6px 14px;background:#334155;border:none;border-radius:6px;color:#ef4444;font-size:12px;cursor:pointer;" onclick="deleteClient(' + index + ')">Delete</button></td></tr>';
          }).join('')}
          ${clientRecords.length ? '' : '<tr><td colspan="5" style="padding:28px 20px;text-align:center;color:#64748b;">No clients registered yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function openClientModal(index){
  const isEdit = typeof index === 'number';
  const client = isEdit ? clientRecords[index] : {id:'',name:'',machineIds:[]};
  const selected = new Set(clientMachineIds(client.name));
  const machineRows = devices.map(function(device){
    const currentClient = device.client || 'Unassigned';
    const warning = isEdit && currentClient !== 'Unassigned' && currentClient !== client.name
      ? '<span style="color:#f59e0b;font-size:11px;margin-left:6px;">Currently: ' + clientEscape(currentClient) + '</span>'
      : '';
    return '<label style="display:flex;align-items:center;gap:8px;padding:9px 0;color:#e2e8f0;font-size:13px;"><input type="checkbox" value="' + clientEscape(device.id) + '"' + (selected.has(device.id) ? ' checked' : '') + ' /> <span>' + clientEscape(device.id) + ' · ' + clientEscape(currentClient) + warning + '</span></label>';
  }).join('');
  let modal = document.getElementById('client-modal');
  if(!modal){ modal = document.createElement('div'); modal.id = 'client-modal'; document.body.appendChild(modal); }
  modal.dataset.editIndex = isEdit ? String(index) : '';
  modal.dataset.originalName = client.name || '';
  modal.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;"><div style="width:min(620px,100%);max-height:90vh;overflow:auto;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);"><h3 style="margin:0 0 18px;color:#f8fafc;font-size:18px;">' + (isEdit ? 'Edit Client' : 'Add Client') + '</h3><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Client Name</label><input id="client-name-input" value="' + clientEscape(client.name) + '" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin:18px 0 6px;">Linked Machines</label><p style="margin:0 0 8px;color:#64748b;font-size:11px;">Selecting a machine reassigns it to this client. The newest linkage replaces the previous client.</p><div style="max-height:240px;overflow:auto;padding:6px 10px;background:#0f172a;border:1px solid #334155;border-radius:8px;">' + (machineRows || '<span style="color:#64748b;font-size:12px;">No machines available</span>') + '</div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button onclick="closeClientModal()" style="padding:9px 18px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-size:13px;cursor:pointer;">Cancel</button><button onclick="saveClientModal()" style="padding:9px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save</button></div></div></div>';
}

function closeClientModal(){
  const modal = document.getElementById('client-modal');
  if(modal) modal.remove();
}

async function saveClientModal(){
  const modal = document.getElementById('client-modal');
  if(!modal) return;
  const nameInput = document.getElementById('client-name-input');
  const name = nameInput ? nameInput.value.trim() : '';
  if(!name){ alert('Client Name is required'); return; }
  const originalName = modal.dataset.originalName || '';
  const machineIds = Array.from(modal.querySelectorAll('input[type=checkbox]:checked')).map(function(input){ return input.value; });
  const editIndex = modal.dataset.editIndex === '' ? -1 : Number(modal.dataset.editIndex);
  const existing = editIndex >= 0 ? clientRecords[editIndex] : null;
  const payload = {id:existing ? existing.id : '', name:name, machineIds:machineIds};
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try{
      if(existing) await window.BSF_API.updateClient(existing.id, payload);
      else await window.BSF_API.createClient(payload);
    }catch(error){ alert('Save failed: ' + error.message); return; }
  }
  const previousIds = originalName ? clientMachineIds(originalName) : [];
  previousIds.filter(function(id){ return machineIds.indexOf(id) === -1; }).forEach(function(id){ clientAssignMachine(id, 'Unassigned'); });
  machineIds.forEach(function(id){ clientAssignMachine(id, name); });
  if(existing){
    if(originalName && originalName !== name){
      userRecords.forEach(function(user){ if(user.client === originalName) user.client = name; });
    }
    existing.name = name;
    existing.machineIds = machineIds;
  } else {
    clientRecords.push({id:'C' + String(clientRecords.length + 1).padStart(3,'0'), name:name, users:0, status:'Active', machineIds:machineIds});
  }
  closeClientModal();
  renderClients(document.getElementById('page-content'));
}

function openMachineAccount(deviceId){
  const device = devices.find(function(item){ return item.id === deviceId; });
  if(!device) return;
  const linkedClient = clientMachineName(deviceId);
  const linkedUsers = machineLinkedUsers(deviceId);
  const clientNames = Array.from(new Set(['Unassigned'].concat(clientRecords.map(function(client){ return client.name; }), linkedClient)));
  const clientOptions = clientNames.map(function(name){ return '<option value="' + clientEscape(name) + '"' + (linkedClient === name ? ' selected' : '') + '>' + clientEscape(name) + '</option>'; }).join('');
  const userRows = linkedUsers.length ? linkedUsers.map(function(user){ return '<div style="padding:8px 0;border-bottom:1px solid #334155;"><span style="color:#f8fafc;font-size:13px;font-weight:600;">' + clientEscape(user.name) + '</span><span style="color:#64748b;font-size:12px;margin-left:8px;">' + clientEscape(user.email) + ' · ' + clientEscape(user.role) + '</span></div>'; }).join('') : '<p style="margin:0;color:#64748b;font-size:12px;">No linked users</p>';
  const inactive = device.accountStatus === 'Inactive';
  let modal = document.getElementById('machine-account-modal');
  if(!modal){ modal = document.createElement('div'); modal.id = 'machine-account-modal'; document.body.appendChild(modal); }
  modal.dataset.deviceId = deviceId;
  modal.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;"><div style="width:min(560px,100%);background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);"><h3 style="margin:0 0 6px;color:#f8fafc;font-size:18px;">Machine Account</h3><p style="margin:0 0 20px;color:#94a3b8;font-size:13px;">' + clientEscape(device.id) + ' · ' + clientEscape(device.name || '') + '</p><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Linked Client</label><select id="machine-account-client" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">' + clientOptions + '</select><div style="margin-top:18px;"><p style="margin:0 0 8px;color:#94a3b8;font-size:12px;font-weight:600;">Linked Users</p><div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px 14px;">' + userRows + '</div></div><p style="margin:16px 0 0;color:#64748b;font-size:11px;">Machines are deactivated instead of permanently deleted so historical data remains available.</p><div style="display:flex;justify-content:space-between;gap:10px;margin-top:20px;flex-wrap:wrap;"><button onclick="toggleMachineAccountStatus()" style="padding:9px 16px;background:' + (inactive ? '#10b981' : '#7f1d1d') + ';border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">' + (inactive ? 'Reactivate Machine' : 'Deactivate Machine') + '</button><div style="display:flex;gap:10px;"><button onclick="closeMachineAccount()" style="padding:9px 18px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-size:13px;cursor:pointer;">Cancel</button><button onclick="saveMachineAccountLinkage()" style="padding:9px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save Linkage</button></div></div></div></div>';
}

function closeMachineAccount(){
  const modal = document.getElementById('machine-account-modal');
  if(modal) modal.remove();
}

async function saveMachineAccountLinkage(){
  const modal = document.getElementById('machine-account-modal');
  if(!modal) return;
  const deviceId = modal.dataset.deviceId;
  const select = document.getElementById('machine-account-client');
  const clientName = select ? select.value : 'Unassigned';
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try{ await window.BSF_API.updateMachine(deviceId, { client:clientName }); }
    catch(error){ alert('Linkage update failed: ' + error.message); return; }
  }
  clientAssignMachine(deviceId, clientName);
  closeMachineAccount();
  renderClients(document.getElementById('page-content'));
}

async function toggleMachineAccountStatus(){
  const modal = document.getElementById('machine-account-modal');
  if(!modal) return;
  const device = devices.find(function(item){ return item.id === modal.dataset.deviceId; });
  if(!device) return;
  const deactivate = device.accountStatus !== 'Inactive';
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try{ await (deactivate ? window.BSF_API.deactivateMachine(device.id) : window.BSF_API.reactivateMachine(device.id)); }
    catch(error){ alert('Status update failed: ' + error.message); return; }
  }
  device.accountStatus = deactivate ? 'Inactive' : 'Active';
  closeMachineAccount();
  renderClients(document.getElementById('page-content'));
}

async function deleteClient(index){
  const client = clientRecords[index];
  if(!client) return;
  const linkedMachines = clientMachineIds(client.name);
  const linkedUsers = clientLinkedUsers(client.name);
  if(!confirm('Delete client "' + client.name + '"? ' + linkedMachines.length + ' machine(s) will become Unassigned and ' + linkedUsers.length + ' linked user(s) will lose this client. Historical data will remain.')) return;
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try{ await window.BSF_API.deleteClient(client.id); }
    catch(error){ alert('Delete failed: ' + error.message); return; }
  }
  linkedMachines.forEach(function(id){ clientAssignMachine(id, 'Unassigned'); });
  linkedUsers.forEach(function(user){ user.client = ''; user.machineId = ''; });
  clientRecords.splice(index, 1);
  renderClients(document.getElementById('page-content'));
}
