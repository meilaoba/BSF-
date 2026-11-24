# ADR-2026-11-24: 投料累计值恢复按吨存储

## 背景

现场 Food Waste In 图显示 11 月 5 日为 `0.016`。如果该值按 kg 解释，只有 16 克，不符合设备投料场景。把同一原始值按吨解释后为 16 kg，符合业务预期。

## 决策

1. 厂家 `input.dailyInput`、`weeklyInput`、`monthlyInput`、`yearlyInput` 按吨保存。
2. 数据库继续使用历史列名 `daily_input_t` 等，不改列名，避免迁移和兼容风险。
3. Food Waste In 在聚合和展示时统一执行 `吨 × 1000 = kg`。
4. `DailyFeedWeight` 继续按 kg，不参与 Food Waste In 计算。
5. 不再把 `dailyInput` 原值直接当作 kg。

## 影响

- 新采集样本继续保存厂家原始吨值。
- 已有 `vendor_device_telemetry` 历史值本来也是厂家原值，无需乘以 1000 回填，避免重复转换。
- 图表日增量、日最大值和月年累计统一在 kg 口径计算。

## 验证

- `dailyInput=0.016` 必须产生 `16 kg`。
- `dailyInput=0` 仍为有效零值。
- 每日累计值转换成小时增量时不能重复累计。
- Graphs 与 Reports 的 Food Waste In 使用同一换算。
