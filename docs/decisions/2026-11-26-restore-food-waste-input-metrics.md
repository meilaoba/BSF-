# ADR-2026-11-26: 恢复 Food Waste In 的 dailyInput 口径

## 背景

2026-11-25 的报表调整把 `RealTimeWeight` 当作投入量，并按平均值推算周期总量。
现场数据确认 `RealTimeWeight` 是设备当前机内物料重量，会随投料、发酵、减量和
出料变化，不能表示本次投料量或当天累计投入量。

厂家字段中：

- `SingleAddMaterial`：最近一次投料重量，单位 kg，只适合展示；
- `input.dailyInput`：当天累计投料量，单位吨；
- `TotalAddMaterial`：历史累计投料量；
- `RealTimeWeight`：当前机内物料重量。

半小时快照会重复上报同一个 `SingleAddMaterial`，直接累加会重复计算。

## 决策

1. Graphs 的 Food Waste In 使用 `input.dailyInput`。
2. 每台设备每天取 `input.dailyInput` 最大值并乘以 1000 转为 kg。
3. 周期总量按设备日求和，不累加半小时快照。
4. Reports 的 Food Waste In 趋势使用 `input.dailyInput`。
5. Reports 的 Waste Collected、GHG 和 Fertilizer 恢复厂家日报
   `kitchenWaste` 计算口径。
6. Machines 的月度 Waste 读取 Graphs 汇总，Daily Waste 读取当天 Food Waste In。
7. `RealTimeWeight` 只在 Machines 和 Raw Data 作为当前重量展示。
8. `SingleAddMaterial` 只展示最近一次投料重量，不直接求和。

## 被拒绝的方案

- 使用 `RealTimeWeight` 平均值 × 天数：会把机内当前重量误当成投入量。
- 累加 `SingleAddMaterial` 快照：同一最近值会重复上报，造成重复计算。
- 用 `kitchenWaste` 替代 Food Waste In：处理量与投入量不是同一业务指标。

## 影响范围

- `backend/src/routes/analytics.js`
- `src/ui/pages/graphs.js`
- `src/ui/pages/reports.js`
- `src/ui/pages/machines.js`
- 对应测试和口径文档

不修改数据库结构、页面布局、导出样式、权限或设备分配。

## 验证

- 2026-11-06 的 60D `dailyInput` 最大值为 `0.01` 吨，即 `10 kg`。
- Graphs、Reports、Machines 对同一天显示同一 Food Waste In。
- `RealTimeWeight` 和 `SingleAddMaterial` 仍保留原始展示。
- 缺失值保持 `null`，真实 `0` 不被当作缺失。
