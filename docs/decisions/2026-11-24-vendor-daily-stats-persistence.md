# ADR-2026-11-24: 厂家日报长期保存与刷新

## 背景

厂家 60 天统计接口提供每日厨余处理量、运行时间、耗电、节省碳排和输出量，但只保证有限的时间窗口。Reports 如果每次只查询厂家接口，超过窗口的数据会消失，厂家暂时不可用时也会失去已有报表。

## 决策

1. 新增 `vendor_daily_stats`，按厂家账号、设备、日期唯一保存每日统计。
2. 同时保存厂家原值和 BSF 规范化后的 kg/kWh 值；读取时按当前换算因子重新计算，规范化列保留为审计快照。
3. `vendor_daily_stats_sync_state` 控制每个厂家账号最多每 30 分钟同步一次。
4. 每台设备首次同步回填最近 60 天，后续滚动刷新最近 3 天。
5. Reports 优先读取本地日报，再合并厂家最近 60 天结果并回写。
6. 厂家暂时不可用时，已有本地日报继续展示；本地也为空时才返回日报状态错误。
7. 厂家 `powerConsume` 只保留为审计字段，Graphs 和 Reports 的能耗仍统一使用设备状态与每日能耗。
8. `input.dailyInput` 的 30 分钟快照和香港时间 00:00 日界线保持不变。
9. `RealTimeWeight` 继续仅作为模板点位的展示字段，不进入业务计算。

## 影响模块

- `backend/db/migrations/018_vendor_daily_stats.sql`
- `backend/src/services/vendor-daily-stats-analytics.js`
- `backend/src/services/vendor-collector.js`
- `backend/src/routes/analytics.js`
- `backend/src/telemetry-worker.js`
- `backend/src/config.js`

## 接口与数据约束

- 唯一键：`(vendor_account_id, vendor_device_id, stat_date)`。
- 日期使用厂家 `statDate`，业务查询按日期比较，不依赖服务器本地时区。
- 原始字段缺失时不清空已保存的非空值。
- 同步失败会写入 `last_error_code`；下一条有效记录仍可正常覆盖。
- 不存在的日报不生成 `0` 记录。

## 验证要求

- 首次同步覆盖最近 60 天，后续成功同步按 30 分钟节流。
- 同一设备同一天重复同步不会产生重复行。
- 本地历史与厂家最近数据按设备、日期合并，厂家新值覆盖旧值。
- 厂家接口失败时，有本地日报仍能生成 Reports。
- Graphs 和 Reports 对同一天继续返回相同的状态能耗。

## 部署顺序

1. 执行 `018_vendor_daily_stats.sql`。
2. 部署后端。
3. 在预发布环境执行 `node src/telemetry-worker.js --once`。
4. 核对 `vendor_daily_stats`、`vendor_daily_stats_sync_state` 和 Worker 日志。
5. 重启 `bsf-telemetry-worker`，恢复到 30 分钟轮询。

本次只生成迁移，不授权或执行生产迁移。
