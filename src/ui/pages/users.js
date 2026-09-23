let userRecords = [];

function renderUsers(container){
  const users = userRecords;
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">User Management</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Manage platform users, roles and access permissions</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <button style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="openUserModal()">+ Add User</button>
      <input type="text" placeholder="Search users..." style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:260px;" />
    </div>
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#0f172a;border-bottom:1px solid #334155;">
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Name</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Email</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Role</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Client</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Linked Machine</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Status</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Actions</th>
        </tr></thead>
        <tbody>
          ${users.map((u,i)=>`
            <tr style="border-bottom:1px solid #334155;background:${i%2===0?'#1e293b':'#1a2332'};">
              <td style="padding:14px 20px;color:#f8fafc;font-weight:600;">${u.name}</td>
              <td style="padding:14px 20px;color:#94a3b8;">${u.email}</td>
              <td style="padding:14px 20px;"><span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${u.role==='Master Admin'?'rgba(239,68,68,0.15)':u.role==='Client Admin'?'rgba(59,130,246,0.15)':'rgba(16,185,129,0.15)'};color:${u.role==='Master Admin'?'#ef4444':u.role==='Client Admin'?'#3b82f6':'#10b981'};">${u.role}</span></td>
              <td style="padding:14px 20px;color:#e2e8f0;">${u.client}</td>
              <td style="padding:14px 20px;color:#94a3b8;">${u.machineId || "—"}</td>
              <td style="padding:14px 20px;"><span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;">${u.status}</span></td>
              <td style="padding:14px 20px;"><button onclick="openUserModal(${i})" style="padding:6px 14px;background:#334155;border:none;border-radius:6px;color:#e2e8f0;font-size:12px;cursor:pointer;margin-right:6px;">Edit</button><button onclick="deleteUserRecord(${i})" style="padding:6px 14px;background:#334155;border:none;border-radius:6px;color:#ef4444;font-size:12px;cursor:pointer;">Delete</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function userClientOptions(selected){
  const names = ['All'].concat(clientRecords.map(function(c){ return c.name; }));
  return names.map(function(name){ return '<option value="' + clientEscape(name) + '"' + (selected===name?' selected':'') + '>' + clientEscape(name) + '</option>'; }).join('');
}

function userMachineOptions(clientName, selected){
  const list = clientName && clientName !== 'All' ? devices.filter(function(dev){ return dev.client===clientName; }) : devices;
  return '<option value="">None</option>' + list.map(function(dev){ return '<option value="' + clientEscape(dev.id) + '"' + (selected===dev.id?' selected':'') + '>' + clientEscape(dev.id) + '</option>'; }).join('');
}

function syncUserMachineOptions(){
  const clientSelect = document.getElementById('user-client-input');
  const machineSelect = document.getElementById('user-machine-input');
  if(!clientSelect || !machineSelect) return;
  machineSelect.innerHTML = userMachineOptions(clientSelect.value, machineSelect.value);
}

function openUserModal(index){
  const isEdit = typeof index === 'number';
  const user = isEdit ? userRecords[index] : {id:'',name:'',email:'',role:'User',client:'',machineId:'',status:'Active'};
  let modal = document.getElementById('user-modal');
  if(!modal){ modal = document.createElement('div'); modal.id='user-modal'; document.body.appendChild(modal); }
  modal.dataset.editIndex = isEdit ? String(index) : '';
  const roles = ['Master Admin','Client Admin','User'].map(function(role){ return '<option value="' + role + '"' + (user.role===role?' selected':'') + '>' + role + '</option>'; }).join('');
  modal.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;"><div style="width:min(560px,100%);background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);"><h3 style="margin:0 0 18px;color:#f8fafc;font-size:18px;">' + (isEdit ? 'Edit User' : 'Add User') + '</h3><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Name</label><input id="user-name-input" value="' + clientEscape(user.name) + '" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;" /><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Email</label><input id="user-email-input" value="' + clientEscape(user.email) + '" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;" /><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Role</label><select id="user-role-input" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;">' + roles + '</select><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Linked Client</label><select id="user-client-input" onchange="syncUserMachineOptions()" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;">' + userClientOptions(user.client) + '</select><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Linked Machine</label><select id="user-machine-input" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;">' + userMachineOptions(user.client, user.machineId) + '</select><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button onclick="closeUserModal()" style="padding:9px 18px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-size:13px;cursor:pointer;">Cancel</button><button onclick="saveUserModal()" style="padding:9px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save</button></div></div></div>';
}

function closeUserModal(){ const modal=document.getElementById('user-modal'); if(modal) modal.remove(); }

async function saveUserModal(){
  const modal=document.getElementById('user-modal'); if(!modal) return;
  const name=(document.getElementById('user-name-input')||{}).value ? document.getElementById('user-name-input').value.trim() : '';
  const email=(document.getElementById('user-email-input')||{}).value ? document.getElementById('user-email-input').value.trim() : '';
  const role=(document.getElementById('user-role-input')||{}).value || 'User';
  const client=(document.getElementById('user-client-input')||{}).value || '';
  const machineId=(document.getElementById('user-machine-input')||{}).value || '';
  if(!name || !email){ alert('Name and Email are required'); return; }
  const editIndex=modal.dataset.editIndex===''?-1:Number(modal.dataset.editIndex);
  const existing=editIndex>=0?userRecords[editIndex]:null;
  const payload={id:existing?existing.id:'',name:name,email:email,role:role,client:client,machineId:machineId,status:'Active'};
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try{ if(existing) await window.BSF_API.updateUser(existing.id,payload); else await window.BSF_API.createUser(payload); }catch(error){ alert('Save failed: '+error.message); return; }
  }
  if(existing){ Object.assign(existing,payload); } else { userRecords.push(Object.assign({id:'U'+String(userRecords.length+1).padStart(3,'0')},payload)); }
  closeUserModal(); renderUsers(document.getElementById('page-content'));
}

async function deleteUserRecord(index){
  const user=userRecords[index]; if(!user) return;
  if(!confirm('Delete user "'+user.name+'"? This cannot be undone.')) return;
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try{ await window.BSF_API.deleteUser(user.id); }catch(error){ alert('Delete failed: '+error.message); return; }
  }
  userRecords.splice(index,1); renderUsers(document.getElementById('page-content'));
}
