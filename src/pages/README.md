# 页面迁移顺序

页面只在客户确认后迁移，禁止自行扩展或重做样式。

建议顺序：

1. Machines
2. Raw Data
3. Clients
4. Users
5. Alerts
6. System Settings
7. API / Data Sources
8. Locations
9. Graphs
10. Reports
11. Logs
12. Account

每个页面迁移时必须满足：

- 视觉和原版工作副本一致
- 数据通过 API/服务层获取
- 不硬编码 MQTT 账号密码
- 不新增未确认功能
