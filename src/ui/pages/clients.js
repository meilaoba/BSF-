let clientRecords = [];

function renderClients(container){
  const clients = clientRecords;
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Client Management</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Manage all registered clients and their device assignments</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <button style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;" onclick="openClientModal()">+ Add Client</button>
      <input type="text" placeholder="Search clients..." style="padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;min-width:260px;" />
    </div>
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#0f172a;border-bottom:1px solid #334155;">
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Client Name</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Devices</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Users</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Status</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Actions</th>
        </tr></thead>
        <tbody>
          ${clients.map((c,i)=>`
            <tr style="border-bottom:1px solid #334155;background:${i%2===0?'#1e293b':'#1a2332'};">
              <td style="padding:14px 20px;color:#f8fafc;font-weight:600;">${c.name}</td>
              <td style="padding:14px 20px;color:#e2e8f0;">${(c.machineIds || []).length}</td>
              <td style="padding:14px 20px;color:#e2e8f0;">${c.users}</td>
              <td style="padding:14px 20px;"><span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;">${c.status}</span></td>
              <td style="padding:14px 20px;"><button onclick="openClientModal(${i})" style="padding:6px 14px;background:#334155;border:none;border-radius:6px;color:#e2e8f0;font-size:12px;cursor:pointer;margin-right:6px;">Edit</button><button style="padding:6px 14px;background:#334155;border:none;border-radius:6px;color:#ef4444;font-size:12px;cursor:pointer;" onclick="deleteClient(${i})">Delete</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function clientEscape(value){
  return String(value || '').replace(/[&<>"']/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

function openClientModal(index){
  const isEdit = typeof index === 'number';
  const client = isEdit ? clientRecords[index] : {id:'',name:'',machineIds:[]};
  const selected = new Set(client.machineIds || []);
  const machineRows = devices.map(function(dev){
    return '<label style="display:flex;align-items:center;gap:8px;padding:8px 0;color:#e2e8f0;font-size:13px;"><input type="checkbox" value="' + clientEscape(dev.id) + '"' + (selected.has(dev.id) ? ' checked' : '') + ' /> ' + clientEscape(dev.id) + ' · ' + clientEscape(dev.client) + '</label>';
  }).join('');
  let modal = document.getElementById('client-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'client-modal';
    document.body.appendChild(modal);
  }
  modal.dataset.editIndex = isEdit ? String(index) : '';
  modal.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;"><div style="width:min(560px,100%);background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);"><h3 style="margin:0 0 18px;color:#f8fafc;font-size:18px;">' + (isEdit ? 'Edit Client' : 'Add Client') + '</h3><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;">Client Name</label><input id="client-name-input" value="' + clientEscape(client.name) + '" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /><label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin:18px 0 6px;">Linked Machines</label><div style="max-height:220px;overflow:auto;padding:6px 10px;background:#0f172a;border:1px solid #334155;border-radius:8px;">' + machineRows + '</div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button onclick="closeClientModal()" style="padding:9px 18px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-size:13px;cursor:pointer;">Cancel</button><button onclick="saveClientModal()" style="padding:9px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save</button></div></div></div>';
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
  if(existing){
    existing.name = name;
    existing.machineIds = machineIds;
  } else {
    clientRecords.push({id:'C' + String(clientRecords.length + 1).padStart(3,'0'), name:name, users:0, status:'Active', machineIds:machineIds});
  }
  closeClientModal();
  renderClients(document.getElementById('page-content'));
}
async function deleteClient(index){
  const client = clientRecords[index];
  if(!client) return;
  if(!confirm('Delete client "' + client.name + '"? This cannot be undone.')) return;
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try{ await window.BSF_API.deleteClient(client.id); }
    catch(error){ alert('Delete failed: ' + error.message); return; }
  }
  clientRecords.splice(index, 1);
  renderClients(document.getElementById('page-content'));
}
