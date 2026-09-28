function accountRoleLabel(){
  return currentRole === 'admin' ? 'Master Admin' : currentRole === 'client-admin' ? 'Client Admin' : 'User';
}

function accountUserRecord(){
  if(typeof userRecords === 'undefined' || !Array.isArray(userRecords)) return null;
  return userRecords.find(function(user){ return user.username === currentUsername || user.email === currentUsername; }) || null;
}

function accountStorageKey(suffix){
  return 'bsf.delivery.account.' + encodeURIComponent(currentUsername || currentRole) + '.' + suffix;
}

function accountLocalProfile(){
  try { return JSON.parse(localStorage.getItem(accountStorageKey('profile')) || '{}'); }
  catch(error) { return {}; }
}

function accountSaveLocalProfile(profile){
  try { localStorage.setItem(accountStorageKey('profile'), JSON.stringify(profile)); } catch(error) {}
}

function accountInitials(name, email){
  const source = String(name || email || accountRoleLabel()).replace(/@.*/, '').replace(/[^a-zA-Z0-9]/g, '');
  return source.slice(0,2).toUpperCase() || 'AC';
}

function accountCurrentProfile(){
  const local = accountLocalProfile();
  const record = accountUserRecord();
  const displayName = local.displayName || (record && record.name) || currentUsername.replace(/@.*/, '') || accountRoleLabel();
  const email = local.email || (record && record.email) || currentUsername || '—';
  return { displayName:displayName, email:email, avatar:local.avatar || '' };
}

function accountAvatarMarkup(profile, size, id){
  const style = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:linear-gradient(135deg,#3b82f6,#2563eb);font-weight:700;font-size:' + Math.round(size * 0.34) + 'px;color:#fff;';
  if(profile.avatar) return '<div id="' + (id || '') + '" style="' + style + '"><img src="' + profile.avatar + '" alt="Avatar" style="width:100%;height:100%;object-fit:cover;" /></div>';
  return '<div id="' + (id || '') + '" style="' + style + '">' + accountInitials(profile.displayName, profile.email) + '</div>';
}

function applyStoredAccountProfile(){
  const profile = accountCurrentProfile();
  const headerName = document.getElementById('user-name');
  const headerAvatar = document.getElementById('user-avatar');
  if(headerName) headerName.textContent = profile.displayName;
  if(headerAvatar){
    headerAvatar.innerHTML = profile.avatar
      ? '<img src="' + profile.avatar + '" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />'
      : accountInitials(profile.displayName, profile.email);
  }
}

function accountToast(message, type){
  let toast = document.getElementById('account-toast');
  if(!toast){ toast = document.createElement('div'); toast.id = 'account-toast'; document.body.appendChild(toast); }
  const success = type !== 'error';
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;padding:12px 18px;border-radius:8px;color:' + (success ? '#e2e8f0' : '#fecaca') + ';background:' + (success ? '#065f46' : '#7f1d1d') + ';border:1px solid ' + (success ? '#10b981' : '#ef4444') + ';box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:13px;font-weight:600;';
  setTimeout(function(){ if(toast) toast.remove(); }, 3200);
}

function renderAccount(container){
  const roleLabel = accountRoleLabel();
  const profile = accountCurrentProfile();
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Account Settings</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Manage your profile and security preferences</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
      <div style="background:#1e293b;border-radius:12px;padding:24px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 18px;text-transform:uppercase;letter-spacing:.5px;">Profile</h3>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:22px;">
          <div id="account-avatar-preview">${accountAvatarMarkup(profile, 72, '')}</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="padding:8px 14px;background:#334155;border-radius:8px;color:#e2e8f0;font-size:12px;font-weight:600;cursor:pointer;text-align:center;">Upload Photo<input type="file" accept="image/*" onchange="handleAccountAvatarSelect(event)" style="display:none;" /></label>
            ${profile.avatar ? '<button onclick="removeAccountAvatar()" style="padding:7px 14px;background:#7f1d1d;border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Remove Photo</button>' : ''}
            <span style="color:#64748b;font-size:11px;">JPG / PNG, maximum 1 MB</span>
          </div>
        </div>
        <label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Display Name</label>
        <input id="account-display-name" type="text" value="${profile.displayName.replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;" />
        <label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Email</label>
        <input type="text" value="${profile.email.replace(/"/g,'&quot;')}" readonly style="width:100%;box-sizing:border-box;padding:10px 14px;background:#111827;border:1px solid #334155;border-radius:8px;color:#94a3b8;font-size:14px;margin-bottom:14px;" />
        <label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Role</label>
        <input type="text" value="${roleLabel}" readonly style="width:100%;box-sizing:border-box;padding:10px 14px;background:#111827;border:1px solid #334155;border-radius:8px;color:#94a3b8;font-size:14px;" />
        <button onclick="saveAccountProfile()" style="width:100%;margin-top:18px;padding:11px 18px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Save Profile</button>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:24px;border:1px solid #334155;">
        <h3 style="font-size:14px;font-weight:600;color:#94a3b8;margin:0 0 18px;text-transform:uppercase;letter-spacing:.5px;">Change Password</h3>
        <label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Current Password</label>
        <input id="account-current-password" type="password" placeholder="Enter current password" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;" />
        <label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">New Password</label>
        <input id="account-new-password" type="password" placeholder="At least 8 characters" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;margin-bottom:14px;" />
        <label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Confirm New Password</label>
        <input id="account-confirm-password" type="password" placeholder="Repeat new password" style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" />
        <p style="margin:10px 0 0;color:#64748b;font-size:11px;">Use at least 8 characters.</p>
        <button onclick="saveAccountPassword()" style="width:100%;margin-top:18px;padding:11px 18px;background:#3b82f6;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Update Password</button>
      </div>
    </div>
  `;
  applyStoredAccountProfile();
}

function handleAccountAvatarSelect(event){
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if(!file) return;
  if(file.size > 1024 * 1024){ accountToast('Image must be 1 MB or smaller', 'error'); event.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = async function(){
    const profile = accountLocalProfile();
    profile.avatar = String(reader.result || '');
    if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
      try { await window.BSF_API.updateAccount({ avatar:profile.avatar }); }
      catch(error){ accountToast('Avatar update failed: ' + error.message, 'error'); return; }
    }
    accountSaveLocalProfile(profile);
    renderAccount(document.getElementById('page-content'));
    accountToast((window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled) ? 'Avatar updated' : 'Avatar updated');
  };
  reader.readAsDataURL(file);
}

function removeAccountAvatar(){
  const profile = accountLocalProfile();
  delete profile.avatar;
  accountSaveLocalProfile(profile);
  renderAccount(document.getElementById('page-content'));
  accountToast('Avatar removed');
}

async function saveAccountProfile(){
  const input = document.getElementById('account-display-name');
  const displayName = input ? input.value.trim() : '';
  if(!displayName){ accountToast('Display Name is required', 'error'); return; }
  const current = accountCurrentProfile();
  const payload = { displayName:displayName, email:current.email };
  if(window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled){
    try { await window.BSF_API.updateAccount(payload); }
    catch(error){ accountToast('Profile update failed: ' + error.message, 'error'); return; }
  }
  const profile = accountLocalProfile();
  profile.displayName = displayName;
  profile.email = current.email;
  accountSaveLocalProfile(profile);
  applyStoredAccountProfile();
  accountToast((window.BSF_API_CONFIG && window.BSF_API_CONFIG.enabled) ? 'Profile updated' : 'Profile saved');
}

async function saveAccountPassword(){
  const currentPassword = (document.getElementById('account-current-password') || {}).value || '';
  const newPassword = (document.getElementById('account-new-password') || {}).value || '';
  const confirmPassword = (document.getElementById('account-confirm-password') || {}).value || '';
  if(!currentPassword || !newPassword || !confirmPassword){ accountToast('Please complete all password fields', 'error'); return; }
  if(newPassword.length < 8){ accountToast('New password must be at least 8 characters', 'error'); return; }
  if(newPassword !== confirmPassword){ accountToast('New passwords do not match', 'error'); return; }
  if(newPassword === currentPassword){ accountToast('New password must be different', 'error'); return; }
  if(!window.BSF_API_CONFIG || !window.BSF_API_CONFIG.enabled){
    accountToast('Password update is temporarily unavailable', 'error');
    return;
  }
  try {
    await window.BSF_API.changePassword({ currentPassword:currentPassword, newPassword:newPassword });
    document.getElementById('account-current-password').value = '';
    document.getElementById('account-new-password').value = '';
    document.getElementById('account-confirm-password').value = '';
    accountToast('Password updated');
  } catch(error) {
    accountToast('Password update failed: ' + error.message, 'error');
  }
}
