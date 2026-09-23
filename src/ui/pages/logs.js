function renderLogs(container){
  const logs = [];
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 8px;">System Logs</h2>
      <p style="color:#64748b;font-size:14px;margin:0;">Audit trail of user actions and system events</p>
    </div>
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#0f172a;border-bottom:1px solid #334155;">
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Time</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">User</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Action</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">IP Address</th>
          <th style="padding:14px 20px;text-align:left;color:#94a3b8;font-weight:600;">Status</th>
        </tr></thead>
        <tbody>
          ${logs.map((l,i)=>`
            <tr style="border-bottom:1px solid #334155;background:${i%2===0?'#1e293b':'#1a2332'};">
              <td style="padding:12px 20px;color:#e2e8f0;font-size:13px;">${l.time}</td>
              <td style="padding:12px 20px;color:#f8fafc;font-weight:600;font-size:13px;">${l.user}</td>
              <td style="padding:12px 20px;color:#94a3b8;font-size:13px;">${l.action}</td>
              <td style="padding:12px 20px;color:#64748b;font-size:13px;">${l.ip}</td>
              <td style="padding:12px 20px;"><span style="padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${l.status==='Success'?'rgba(16,185,129,0.15)':'rgba(59,130,246,0.15)'};color:${l.status==='Success'?'#10b981':'#3b82f6'};">${l.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
