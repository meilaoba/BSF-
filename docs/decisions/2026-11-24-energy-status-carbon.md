# ADR-2026-11-24: 统一能耗、设备状态与 GHG 口径

## 背景

Graphs 和 Reports 曾使用不同的能耗来源：Graphs 根据遥测运行状态估算，Reports 直接读取厂家日报 `powerConsume`。Machines 又可能使用厂家实时状态，而 Raw Data 使用采集时保存的 `device_online_code`，导致同一时刻显示不同状态。

## 决策

1. Graphs 和 Reports 统一使用 `resolveDailyEnergyKwh()`：
   - Running / Standby 使用每日能耗；
   - Offline 为 `0`；
   - 无状态为 `null`。
2. 厂家日报 `powerConsume` 仅保留为审计字段。
3. 最新设备状态统一取自 `vendor_device_telemetry` 的最新采集行，并返回 `statusCapturedAt`。
4. GHG 按 `2026.10.31_Carbon Emission & Reduction R1.xlsx` 的公式执行，厨余为 `0` 时可以产生负减排值。

## 影响模块

- `backend/src/shared/metrics.js`
- `backend/src/services/vendor-daily-stats-analytics.js`
- `backend/src/services/vendor-analytics.js`
- `backend/src/routes/analytics.js`
- `backend/src/routes/vendor-devices.js`
- `src/shared/metrics.js`
- `src/ui/backend-data.js`

## 验证要求

- Graphs 与 Reports 对同一设备和同一天返回相同能耗。
- Machines 与 Raw Data 最新一条记录使用相同状态及其采集时间。
- CIC 和 HSITP 的碳排、运输和减碳结果与表格数值一致。
- `null`、真实 `0`、Offline 和缺少 GHG 配置保持可区分。

## 未包含

- 未修改数据库结构。
- 未部署生产环境。
- 未改变厂家日报 `kitchenWaste` 作为 Reports 厨余处理量的来源。
