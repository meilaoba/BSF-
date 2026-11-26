# ADR-2026-11-26: Weight 指标使用 RealTimeWeight 绝对值

## 背景

Weight 版本曾把 `RealTimeWeight` 的负数当作缺失并排除。现场数据中负数持续出现，
业务要求负数不归零、也不丢弃，而是按绝对重量参与 Waste-in 计算。

## 决策

1. Graphs、Reports 和 Machines 恢复 Weight 计算口径。
2. 每条在线 Running/Standby 的 `RealTimeWeight` 先取绝对值。
3. 日值使用绝对 Weight 平均值；周期值使用唯一采样绝对平均值。
4. 月总量 = 周期绝对 Weight 平均值 × 有效在线天数。
5. GHG 和 Fertilizer 从该 Waste-in 推导。
6. Offline 采样仍不参与。
7. Raw Data 保留厂家原始正负值，只在指标聚合层取绝对值。
8. `0 kg` 是有效值。
9. Weight 图表没有数据时显示空白，不回退到 `input.dailyInput`。

## 示例

```text
-8.7 kg -> 8.7 kg
-5.2 kg -> 5.2 kg
 0.0 kg -> 0.0 kg
+6.1 kg -> 6.1 kg
```

## 影响范围

- `backend/src/services/vendor-analytics.js`
- `backend/src/routes/analytics.js`
- `src/ui/pages/graphs.js`
- `src/ui/pages/reports.js`
- `src/ui/pages/machines.js`
- `src/ui/report-xlsx.js`
- 对应测试和口径文档

不修改数据库结构、页面布局、Raw Data 原始值、权限或设备分配。

## 验证

- 负数采样不再被 SQL `WHERE >= 0` 排除。
- SQL 聚合使用 `SUM(ABS(...))`、`AVG(ABS(...))`。
- 前端 Weight 图表对负值也有兜底绝对值处理。
- Offline 样本不参与。
- 真实 0 继续作为有效值。
