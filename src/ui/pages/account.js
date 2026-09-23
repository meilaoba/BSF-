function renderAccount(container){
  const roleLabel = currentRole === 'admin' ? 'Master Admin' : currentRole === 'client-admin' ? 'Client Admin' : 'User';
  const displayName = roleLabel + ' User';
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">Account Settings</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Manage your profile and security preferences</p>
    </div>
    <div style="background:#1e293b;border-radius:12px;padding:24px;border:1px solid #334155;max-width:600px;">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
        <div style="width:64px;height:64px;background:linear-gradient(135deg,#3b82f6,#2563eb);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;">AD</div>
        <div>
          <p style="margin:0;font-weight:700;color:#f8fafc;font-size:16px;">${displayName}</p>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">—</p>
          <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(239,68,68,0.15);color:#ef4444;">${roleLabel}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Display Name</label><input type="text" value="Admin User" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div>
        <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">Current Password</label><input type="password" placeholder="Enter current password" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div>
        <div><label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;">New Password</label><input type="password" placeholder="Enter new password" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;" /></div>
      </div>
      <div style="margin-top:24px;">
        <button style="padding:12px 28px;background:#10b981;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Update Profile</button>
      </div>
    </div>
  `;
}
