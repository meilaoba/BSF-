# 2026-09-24 问题修复记录

## 1. 角色名称与顶部用户信息

- 登录页、导航栏、Users 页面统一使用：
  - Master Admin
  - Client Admin
  - User
- 角色切换时自动同步默认账号：
  - admin@platform.hk
  - client@platform.hk
  - user@platform.hk
- 右上角角色名称、账号和头像缩写随登录角色变化。

## 2. Raw Data

- 增加 Client Filter、Machine Filter、开始时间和结束时间筛选。
- Filter 按钮已生效。
- Export CSV 按钮已生效。
- 每页最多显示 30 条记录。
- 支持 Prev、页码和 Next 分页。
- 筛选条件变化后自动回到第 1 页。
- Client Admin / User 每 10 分钟只取最近一条记录，并追加保存到历史，不再覆盖上一条。
- 历史记录使用设备 ID + 上报时间去重，保存在 localStorage。
- Master Admin 保持完整历史。

## 3. API / Data Sources

- MQTT Broker 状态接入真实网关检查。
- 增加 Check Connection 按钮。
- Data Ingestion Stats 接入真实数据：
  - Messages in Buffer
  - Avg Latency
  - Gateway Status
  - Last Data Received
- 修复 api-gateway-status 的 HTML 属性位置错误。

## 4. Alerts / 主动推送

- 增加 Restart Machine 按钮和接口预留。
- 增加 Sample Alert Preview。
- 增加 Push Alert 弹窗。
- 支持选择：
  - Email
  - WhatsApp
- 推送消息会进入右上角消息中心。
- 告警规则显示 Email / WhatsApp to Admin。
- 删除旧的 Edit Thresholds 按钮。
- 保留 Edit the threshold of each machine。

## 5. 消息中心

- 右上角铃铛支持点击展开。
- 显示未读数量。
- 支持单条已读。
- 支持全部已读。
- API 连接检查、主动推送和网关连接状态会生成通知。
- 已读状态保存在 localStorage。

## 6. Report Generation

- 增加 Client Filter。
- 标题支持：
  - Client Monthly Report
  - Client Yearly Report
  - Machine Monthly Report
  - Machine Yearly Report
- Est. Fertilizer 按日产量 × 当月天数计算，年报表按 365 天计算。
- 增加 Monthly Food Waste In (KG) 图表。
- 删除 Alert Summary 的 Total Alerts 行。
- 删除 Reporting Days。
- 实现 Export PDF、Export Excel、Export CSV。
- 三种导出均增加浏览器界面提示。

## 7. Graphs

- 当前已恢复真实趋势柱形图版本。
- Temp Trend 支持按天、月、年聚合。
- 各图表 Daily / Monthly / Yearly 独立切换。

## 8. Git 记录

本记录对应分支：

```text
fix/2026-09-24
```

今日主要提交：

```text
2f58559 Remove-legacy-edit-thresholds
56ff4b8 Add-raw-pagination-and-role-display
593abbd Preserve-client-admin-user-raw-history
70101b8 Add-raw-filter-api-stats-alert-push
c1249a7 Add-notification-center
20c6cc9 Fix-role-restart-whatsapp-api-report
```
