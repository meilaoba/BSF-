# 能耗、设备状态与碳排口径

更新日期：2026-11-24

## 权威来源

| 业务能力 | 权威来源 | 说明 |
| --- | --- | --- |
| 最新设备状态 | `vendor_device_telemetry.device_online_code` | 每台设备取 `captured_at` 最新的一条，包含离线且指标为空的记录 |
| Graphs / Reports 能耗 | 每台设备每天的统一运行状态 | Running 和 Standby 使用每日能耗；Offline 不显示且不参与汇总，无状态为未知 |
| Reports 厨余处理量 | 厂家日报 `kitchenWaste` | 保留原有日报来源 |
| Graphs / Reports 图表 | `RealTimeWeight` | 使用在线 Running/Standby 的 Weight 平均值；`input.dailyInput` 不再参与页面图表 |
| 厂家日报 `powerConsume` | 厂家日报接口 | 只保留为审计字段，不再作为业务展示能耗 |
| GHG | `docs` 中的碳排公式和站点配置 | 使用厨余减排、电力碳排和运输碳排 |

## 能耗规则

`resolveDailyEnergyKwh()` 是 Graphs 和 Reports 共用的唯一能耗计算入口。

| 设备日状态 | 能耗 |
| --- | ---: |
| Running `2` | `standbyEnergyKwh`，默认 `1.5 kWh/日` |
| Standby `1` | `standbyEnergyKwh`，默认 `1.5 kWh/日` |
| Offline `0` | 不进入平均、能耗、GHG 和肥料计算，图表保持空白 |
| 没有可用状态 | `null`，界面显示 `—` |

厂家日报返回的 `powerConsume` 不再覆盖上述结果。

## 最新设备状态快照

- Machines、Locations 和 Raw Data 的最新状态必须来自同一条最新采集记录。
- 状态快照包含 `statusCapturedAt`，用于确认状态对应的采集时间。
- 不能因为最新记录的温度、湿度或重量为空，就跳过该记录并回退到厂家实时状态。
- 厂家 REST / WebSocket 状态可以作为实时辅助信息，但不能覆盖已持久化的最新状态快照。

## GHG 公式

基准来源：

- `2026.10.31_Carbon Emission & Reduction R1.xlsx`
- `工作表1!C3:C10`
- `工作表1!C18:C49`

### 参数

| 参数 | 值 |
| --- | ---: |
| CIC ZCP 月度行驶里程 | `140 km/月` |
| HSITP 月度行驶里程 | `24 km/月` |
| 港岛电力碳排因子 | `0.71 kg CO₂e/kWh` |
| 非港岛电力碳排因子 | `0.37 kg CO₂e/kWh` |
| 汽油消耗 | `8.3 L/100km` |
| 汽油排放因子 | `2.32 kg CO₂e/L` |
| 厨余减排系数 | `1.5 kg CO₂e/kg` |

### 每日运输碳排

```text
每日行驶里程 = 月度行驶里程 × 12 / 365
运输碳排 = 每日行驶里程 / 100 × 8.3 × 2.32
```

### 每日机器碳排

```text
CIC 电力碳排 = 1.5 × 0.37 = 0.555
HSITP 电力碳排 = -1.5 × 0.37 = -0.555
机器碳排 = 电力碳排 + 运输碳排
```

### 每日减碳

```text
GHG Reduced = 回收厨余(kg) × 1.5 - 机器碳排
```

表格示例结果：

| 站点 | 每日机器碳排 | 回收 2 kg 的减碳 |
| --- | ---: | ---: |
| CIC ZCP | `1.4413035616 kg CO₂e` | `1.5586964384 kg CO₂e` |
| HSITP | `-0.4030622466 kg CO₂e` | `3.4030622466 kg CO₂e` |

真实厨余 `0` 按表格公式产生负减排值；字段缺失或公式配置不完整时返回 `null`。

## 设备级配置

`CR-50S / 365701012616B60D` 使用 HSITP 机器级覆盖：

- `region = non-hk`
- `monthlyDistanceKm = 24`
- `solar = true`

该覆盖保存在 `machines.metadata.ghgFormula`，不依赖 Client 绑定。

## 型号默认公式

为了避免厂家设备尚未同步成本地 Machine 时 GHG 显示 `—`，后端按设备型号提供 Excel 默认公式。数据库中的 Client 或 Machine 配置仍优先于型号默认值。

| 型号 | 区域 | 月行驶里程 | 太阳能 |
| --- | --- | ---: | --- |
| CR-50S / 50KG | non-hk | 24 km | true |
| CR-30S / 30KG | non-hk | 140 km | false |

其他型号不会自动套用这两组公式。
