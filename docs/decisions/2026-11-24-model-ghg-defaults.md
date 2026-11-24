# ADR-2026-11-24: 按设备型号加载 GHG 默认公式

## 背景

用户提供的 `2026.10.31_Carbon Emission & Reduction R1.xlsx` 已包含完整公式。线上设备即使有投料、温度、湿度和运行状态，GHG 仍显示 `—`，原因是厂家设备没有本地 Machine 覆盖配置时，运行时公式对象缺少 `monthlyDistanceKm`。

## 决策

1. 从 Excel 固化已知型号的默认公式：
   - `CR-50S`：月行驶 24 km，solar=true。
   - `CR-30S`：月行驶 140 km，solar=false。
2. 公式选择顺序为：型号默认值 → Client 配置 → Machine 配置。
3. 设备本地 Machine 不存在时，Reports 和 Graphs 仍可使用型号默认值。
4. 其他型号不自动套用上述公式，避免把错误站点参数应用到未知设备。
5. Excel 其余常量继续使用现有正式配置：电力因子 0.71/0.37、油耗 8.3 L/100km、汽油因子 2.32 kg CO₂e/L、厨余减排系数 1.5。

## 影响

- `backend/src/shared/ghg-defaults.js`
- `backend/src/services/vendor-analytics.js`
- 不新增数据库迁移。
- 数据库中的 Client/Machine 配置仍可覆盖默认公式。

## 验证

- CR-50S 回收 2 kg 的 GHG Reduced 为 `3.4030622465753426 kg CO₂e`。
- CR-30S 回收 2 kg 的 GHG Reduced 为 `1.5586964383561646 kg CO₂e`。
- 未知型号仍返回不可计算，不生成默认 GHG。
