# 交付架构

## 分层

~~~text
设备
  → 厂家 REST API
  → BSF 后端（认证、标准化、持久化）
  → PostgreSQL
  → HTTP API
  → 结构化 Web 前端
~~~

## 前端边界

前端负责：

- 页面和原版样式
- Client / Machine Filter
- 图表和列表显示
- 调用同源 `/api/v1` 后端接口
- 错误和空数据状态

前端不负责：

- 保存厂家 Token
- 直接连接厂家系统或设备网络
- 保存权威历史数据
- 绕过后端做权限判断

前端会保存按角色和账号隔离的轮询缓存，用于追加最新记录、去重并跨刷新保留历史；厂家与后端仍是数据源。

## 数据流

1. 用户通过 BSF 后端登录，厂家 Token 只保存在服务端加密会话中。
2. `/api/v1/vendor-devices` 代理厂家设备列表。
3. `/api/v1/machines` 提供客户与机器资料。
4. `/api/v1/device-data`、`/api/v1/raw-data-samples`、Machines、Locations 和
   Graphs 读取 `vendor_device_telemetry`；Food Waste In 只使用
   `input.dailyInput`，不得用厂家日报处理量替代。
5. Reports 的 Waste Collected 读取厂家日报 `kitchenWaste`；运行状态、能耗、
   温度和湿度从 `vendor_device_telemetry` 补充。厂家日报 `powerConsume`
   仅保留为审计字段，不再作为业务展示能耗。
6. `/api/v1/vendor-devices/history` 只提供厂家历史温湿度曲线。
7. Master Admin 每 3 分钟、Client Admin / User 每 10 分钟读取一次最新记录；
   Client Admin 的可见范围由厂家账号设备池和其 Client 归属共同决定。
8. 最新记录追加到本地角色隔离缓存，按设备与上报时间去重，不覆盖旧历史。
9. 同一业务指标只能有一个权威字段来源，禁止页面之间交叉兜底。
10. 最新设备状态统一取 `vendor_device_telemetry` 中每台设备的最新采集行，
    包含离线且指标为空的记录，并携带 `statusCapturedAt`。
11. Graphs 和 Reports 统一通过 `resolveDailyEnergyKwh()` 计算能耗：
    Running / Standby 使用每日能耗，Offline 为 0，无状态为 `null`。
12. 未绑定客户或机器的厂家设备显示为 `Unassigned`，系统不会自动绑定。
