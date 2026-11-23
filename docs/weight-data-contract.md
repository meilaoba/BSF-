# 重量与投料数据口径

更新日期：2026-11-23
状态：已统一业务字段来源，待真实设备跨日回归

## 业务指标与唯一来源

| 页面指标 | 权威字段 | 数据来源 | 统一转换 |
| --- | --- | --- | ---: |
| Food Waste In | `input.dailyInput` | `vendor_device_telemetry` | 当天最大值，吨 × 1000 = kg |
| Waste Collected | 厂家日报 `kitchenWaste` | 厂家日报接口 | 乘以配置的 `kitchenWasteToKgFactor` |
| Total Added | `TotalAddMaterial` | 厂家实时接口 | 吨 × 1000 = kg |
| Total Discharge | `TotalDischarge` | 厂家实时接口 | 吨 × 1000 = kg |

`Food Waste In` 是投入量，`Waste Collected` 是处理后厨余量。二者是不同指标，
不得互相兜底，也不得因为其中一个缺失而显示另一个字段。

## 已确认事实

- 厂家没有上报机器自身重量；所有重量相关数据均与投料、物料或处理量有关。
- `input.dailyInput`、`monthlyInput`、`yearlyInput` 的单位是吨（t）。
- 厂家累计投料量与累计出料量的单位是吨；展示和进入公式前转换为 kg。
- 厂家日报按日返回；月报和年报按有效日逐日累加，不使用累计计数器差分。
- `deviceOnline`：`0=离线`、`1=待机`、`2=运行中`。
- 厂家数据按 30 分钟一批更新，界面不得承诺秒级实时。

## 原始字段

| 厂家字段 | 单位 | 当前用途 |
| --- | ---: | --- |
| `input.dailyInput` | t | Food Waste In 的唯一权威字段 |
| `TotalAddMaterial` | t | 累计投料展示；不能逐条相加 |
| `TotalDischarge` | t | 累计出料展示；不能逐条相加 |
| `DailyFeedWeight` | kg | 仅保留为 Raw Data 原始字段；跨日规则未确认，不参与业务计算 |
| `SingleAddMaterial` | kg | Raw Data 展示 |
| `SingleDischarge` | 未确认 | Raw Data 展示 |
| `RealTimeWeight` | 未确认 | Raw Data 展示 |
| `OtalUnloadingWeight` | 未确认 | Raw Data 展示 |
| `kitchenWaste` | 未确认 | Waste Collected 的厂家日报来源；单位通过配置因子转换 |

## 强制规则

1. Graphs 的 Food Waste In 只能聚合 `dailyInput`。
2. Reports 的 Waste Collected 只能读取厂家日报 `kitchenWaste`。
3. `DailyFeedWeight` 不得覆盖 `dailyInput`，直到厂家确认清零和跨日规则。
4. 累计计数器只展示，不做逐条累加。
5. 真实 `0` 是有效值；字段缺失或非法时返回 `null`，界面显示 `—`。
6. 不补零、不生成模拟数据、不用另一业务字段替代缺失值。

## 仍需厂家确认

- `kitchenWaste`、`powerConsume`、`runTime`、`unloadingWeight` 的最终单位。
- `DailyFeedWeight` 的清零、离线补传和跨日规则。
- `RealTimeWeight`、`SingleDischarge`、`OtalUnloadingWeight` 的业务定义。

## 验收

- 后端单元测试验证两个业务指标不会交叉回退。
- 前端测试验证 Raw Data 字段映射、缺失值和 CSV 导出。
- 上线前使用同一设备至少一个完整自然日验证日切、补传和重复上报。
