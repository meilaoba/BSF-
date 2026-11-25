# BSF 前端界面数据来源说明

更新日期：2026-11-24

本文按页面列出当前前端可见数据的来源。说明的是**当前代码实际行为**，不代表理想的最终架构。

## 来源标记

| 标记 | 含义 |
| --- | --- |
| 厂家字段 | 直接来自厂家接口响应，未改变数值含义 |
| 厂家汇总 | 对厂家字段做最大值、平均值、差值、周期聚合 |
| BSF 计算 | 根据厂家字段和 BSF 业务参数计算出的值 |
| 本地数据库 | 来自 BSF PostgreSQL，不属于厂家设备遥测 |
| 用户输入 | 当前用户在筛选项或表单中输入的值 |
| 外部服务 | 来自 BSF 之外的公共服务，例如香港天文台 |
| 静态/演示 | 当前写死在页面的文字、阈值或占位值，不是实时业务数据 |
| 未接入 | 页面预留，但当前没有真实数据 |

## 全局页面数据

| 界面数据 | 来源 | 说明 |
| --- | --- | --- |
| 登录用户名 | 用户输入 | 提交给 BSF 登录接口 |
| 登录密码 | 用户输入 | 只在登录时提交，不应保存到前端 |
| 当前用户名、角色、Client、Machine | 本地数据库 + 厂家登录结果 | 厂家身份登录后映射为 BSF 角色和本地绑定 |
| 顶部角色标签 | 本地数据库 | 作用域过滤使用 |
| 通知角标和通知记录 | 本地数据库/BSF 计算 | 来自 BSF 告警与通知记录 |
| 侧栏菜单 | 静态配置 | 根据当前角色显示 |

## Machines

| 界面数据 | 来源 | 原始字段或计算 |
| --- | --- | --- |
| Client Filter | 本地数据库 | `clients.name` |
| Machine Filter | 厂家设备列表 + 本地映射 | 显示编号通常来自厂家 `deviceSerialNum` |
| Running / Standby / Offline 数量 | 厂家字段汇总 | 每台唯一设备取最新 `deviceOnline` 后计数 |
| Device Status 状态 | 厂家字段 | 最新采集行的 `deviceOnline` |
| Device ID | 厂家字段 + 本地映射 | 厂家 `deviceSerialNum`，有本地机器时使用本地显示 ID |
| Device Name | 厂家字段 + 本地数据库 | 优先本地 `machines.name`，否则厂家 `deviceName` |
| Network | 静态/品牌文本 | 当前显示为 `Vendor API` |
| This Month Waste | 厂家汇总 | `input.dailyInput` 按天取最大值，单位 kg |
| Daily Waste | 厂家汇总 | 当天 `input.dailyInput`，单位 kg |
| This Month GHG Reduced | BSF 计算 | 厨余减排 − 电力碳排 − 运输碳排 |
| Est. Fertilizer This Month | BSF 计算 | 厨余量 × `fertilizerRatio` |
| Container Temp | 厂家字段 | `CabinTemp` |
| Container Humidity | 厂家字段 | `Humidity`；若为 0–1 小数，前端按 100 换算为百分比 |
| Avg Env Temp | 外部服务 | 香港天文台环境温度 |
| Last Update | 厂家字段/本地采集 | 厂家遥测时间或本地最新采集时间 |
| Location Display | 厂家字段 + 本地映射 | 本地坐标优先，否则厂家经纬度 |
| GPS 坐标缺失提示 | 静态逻辑 | 设备没有有效坐标时显示 |

## Locations

| 界面数据 | 来源 | 原始字段或计算 |
| --- | --- | --- |
| Client Filter | 本地数据库 | `clients.name` |
| Device ID、设备名称 | 厂家字段 + 本地映射 | 厂家设备列表与本地机器资料 |
| Running / Standby / Offline | 厂家字段 | `deviceOnline` |
| 地图坐标 | 厂家字段 | 厂家 `deviceLatitude`、`deviceLongitude` |
| 地址 | 厂家字段 | 厂家 `deviceAddress` 或 `location` |
| Current Client | 本地数据库 | `machines.client_id → clients.name` |
| Last Update | 厂家字段/本地采集 | 最新数据时间 |
| CIC Zero Carbon Park 坐标 | 静态覆盖 | 当前代码写死 CIC 地址与 Google Maps 链接 |
| Powered by | 静态文本 | `iBrain Tech` |

## Graphs / Data Analytics

| 界面数据 | 来源 | 原始字段或计算 |
| --- | --- | --- |
| Client Filter | 本地数据库 | Client 名称 |
| Machine Filter | 厂家设备列表 + 本地映射 | 设备编号 |
| Start / End Date | 用户输入 | 前端传入 `/api/v1/graphs` |
| Period Filter | 用户输入 | Daily / Monthly / Yearly |
| `N data points loaded` | BSF 计算 | 聚合后非空食品重量点数量 |
| Food Waste In | 厂家汇总 | `input.dailyInput`（厂家吨值 × 1000）的日增量/日最大值/月或年累计 |
| Container Temp | 厂家汇总 | `CabinTemp` 的时/日/月平均 |
| Container Humidity | 厂家汇总 | `Humidity` 的时/日/月平均 |
| Energy Consumed | BSF 计算 | 当天设备状态为 Running/Standby 时使用每日能耗，当前默认 1.5 kWh；Offline 为 0 |
| GHG Reduced | BSF 计算 | 厨余量 × 1.5 − 电力碳排 − 运输碳排；CR-50S/CR-30S 使用 Excel 型号默认公式，数据库配置优先 |
| Avg 值 | BSF 计算 | 前端对所有非空图点求平均 |
| `No data for selected period` | 状态文本 | 当前选择范围聚合后无值 |

## Raw Data

| 表格列 | 来源 | 原始字段或计算 |
| --- | --- | --- |
| Recorded At | 本地数据库 | 定时采集任务的 `capturedAt` |
| Device | 本地数据库 + 厂家字段 | 本地机器序列/名称；未关联时使用厂家设备 ID |
| State | 厂家字段 | `deviceOnline` |
| Operating | 厂家字段 | `OperatingStatus` |
| Ferment | 厂家字段 | `FermentState` |
| Run Time(min) | 厂家字段 | `RunTime` |
| Weight(kg) | 厂家字段 | `RealTimeWeight` |
| Daily Feed(kg) | 厂家字段 | `DailyFeedWeight` |
| Total Add(kg) | 厂家字段 + 单位换算 | `TotalAddMaterial`，吨 × 1000 |
| Single Add(kg) | 厂家字段 | `SingleAddMaterial` |
| Total Discharge(kg) | 厂家字段 + 单位换算 | `TotalDischarge`；缺失时兼容 `OtalUnloadingWeight`，吨 × 1000 |
| Single Discharge(kg) | 厂家字段 | `SingleDischarge` |
| Discharge | 厂家字段 | `Discharge` 状态码 |
| Feed | 厂家字段 | `Feed` 状态码 |
| Shredder | 厂家字段 | `Shredder` 状态码 |
| Mixing Motor | 厂家字段 | `MixingMotor` 状态码 |
| Fan | 厂家字段 | `Fan` 状态码 |
| Zipper | 厂家字段 | `Zipper` 状态码 |
| Temp(°C) | 厂家字段 | `CabinTemp` |
| Hot Plate Temp(°C) | 厂家字段 | `HotPlateTemp` |
| Hum(%) | 厂家字段 | `Humidity`，必要时进行小数转百分比 |
| Energy(kWh) | 厂家字段 | `Energy` |
| Solar Power(kW) | 厂家字段 | `SolarPower` |
| CO₂(ppm) | 厂家字段 | `CO2` |
| NO₂(ppm) | 厂家字段 | `NO2` |
| H₂S(ppm) | 厂家字段 | `H2S` |
| Signal | 厂家字段 | `Signal` |
| 保存样本数量 | 本地数据库 | 当前筛选范围内的采集记录数 |

## Reports

| 界面数据 | 来源 | 原始字段或计算 |
| --- | --- | --- |
| Client / Machine / Period | 用户输入 + 本地映射 | 页面筛选条件 |
| Waste Collected | 本地数据库 + 厂家字段 | `vendor_daily_stats.kitchen_waste_kg`；由厂家日报 `kitchenWaste` 同步并长期保存 |
| GHG Reduced | BSF 计算 | 厨余量 × 1.5 − 电力碳排 − 运输碳排；CR-50S/CR-30S 使用 Excel 型号默认公式，数据库配置优先 |
| Energy Consumed | BSF 计算 | 厂家 `deviceOnline` 聚合后的运行/待机日 × 每日能耗 |
| Est. Fertilizer | BSF 计算 | 厂家日报厨余量 × `fertilizerRatio` |
| Avg Container Temp | 厂家汇总 | 遥测 `CabinTemp` 平均值 |
| Avg Humidity | 厂家汇总 | 遥测 `Humidity` 平均值 |
| Food Waste In 图表 | 厂家汇总 | 遥测 `input.dailyInput` 吨值转换为 kg，不依赖厂家日报是否存在 |
| `No vendor daily report` | API 状态 | 本地和厂家日报都没有所选周期的数据 |
| `Some vendor daily reports are unavailable` | API 状态 | 部分设备日报请求失败 |
| Export Excel | BSF 计算 | 浏览器本地生成三个独立工作表：`Weight`、`Temp`、`Humidity`，不调用厂家导出接口 |

## Clients

| 界面数据 | 来源 | 说明 |
| --- | --- | --- |
| Client Name | 本地数据库 | `clients.name` |
| Client Status | 本地数据库 | `clients.status` |
| Linked Machines | 本地数据库 | `machines.client_id` |
| Users | 本地数据库 | 属于该 Client 的本地用户数量 |
| Machine Account 当前 Client | 本地数据库 | 当前机器绑定关系 |
| Machine Account 状态 | 本地数据库 | `machines.status`，不是厂家 `deviceOnline` |

## Users

| 界面数据 | 来源 | 说明 |
| --- | --- | --- |
| Username | 厂家字段 + 本地数据库 | 厂家 `userName` 与本地用户记录 |
| Email、Phone | 本地数据库/厂家用户接口 | 取决于用户创建与关联情况 |
| Role | BSF 计算/映射 | 根据角色和厂家 `userType` 映射为 Master Admin、Client Admin、User |
| Client | 本地数据库 | `users.client_id` |
| Linked Machine | 本地数据库 | `users.machine_id` |
| Status | 本地数据库 | active / invited / disabled |
| Add/Edit 表单字段 | 用户输入 | 提交时写入本地数据库；新增用户还会调用厂家 `/user/add` |

## Alerts

| 界面数据 | 来源 | 说明 |
| --- | --- | --- |
| Client / Machine Filter | 本地数据库 | 当前可见范围 |
| CO₂ 900 ppm、NO₂ 0.18 ppm、H₂S 0.25 ppm | 静态/演示 | 当前为写死的界面阈值 |
| Temperature low/high | 本地数据库 | BSF 机器阈值，缺省为 12/58 °C |
| Alert History | BSF 计算 + 本地数据库 | 厂家温度与本地阈值比较后生成，并读取本地告警记录 |
| Sample Alert Preview | 静态/演示 | 固定文案，不是厂家实时告警 |
| Restart Machine | 未接入/控制动作 | 依赖后端和设备控制能力 |
| Export Alarms | 厂家文件 | 后端代理厂家 `/export/emFault`；选择 Machine 时按精确 `deviceName` 过滤 |

## System Settings

| 界面数据 | 来源 | 说明 |
| --- | --- | --- |
| Client Name、Timezone、Language | 静态/用户输入 | 当前主要是界面占位值 |
| SMTP Server、Alert Email、Map Service | 静态/用户输入 | 当前主要是界面占位值 |
| GHG Machine、Region、Solar、Monthly Distance | 本地数据库 | `machines.region` 和 `machines.metadata.ghgFormula` |
| Weight Scaling | 用户输入 | 当前保存能力需要以后端设置接口为准 |
| Reset First Date | 用户输入 | 当前保存能力需要以后端设置接口为准 |

## System Logs

| 界面数据 | 来源 | 当前状态 |
| --- | --- | --- |
| Time、User、Action、IP、Status | 本地数据库/未接入 | 当前前端日志数组为空；真实数据应来自 BSF audit logs |
| 厂家 `emOperation/list` 操作记录 | 厂家字段/未接入 | 当前 Logs 页面尚未展示该接口 |

## API / Data Sources

| 界面数据 | 来源 | 说明 |
| --- | --- | --- |
| Vendor REST API 状态 | 厂家 API | 通过 `/vendor-devices` 检查 |
| Platform REST API 状态 | 本地服务 | `/api/v1/health` |
| Telemetry Source | BSF 计算 | 根据厂家检查成功与否显示 Vendor API / Unavailable |
| Recent Records | 本地浏览器缓存 | `rawDataRows.length` |
| Request Latency | BSF 计算 | 浏览器请求耗时 |
| Last Data Received | 本地浏览器缓存 | 最新本地缓存记录时间 |
| Vendor Templates | 厂家字段 | `/emTemplate/list` |
| Template point name、key、unit、display、reporting、sort、states | 厂家字段 | 对应厂家模板点位字段 |

## Account

| 界面数据 | 来源 | 说明 |
| --- | --- | --- |
| Avatar Initials | BSF 计算 | 根据用户名或邮箱生成 |
| Display Name、Username、Email、Phone | 本地数据库 + 登录会话 | 当前 BSF 用户资料 |
| Role | 本地数据库 | BSF 角色 |
| Password fields | 用户输入 | 修改密码时提交 |

## 重要现状

1. Reports 的 `Waste Collected` 读取 BSF `vendor_daily_stats`；最近 60 天会从厂家日报刷新并回写，更早数据只从本地数据库读取。Metric 为空时 GHG/Fertilizer 也为空。
2. Reports 的 Food Waste In 图表使用遥测 `input.dailyInput`，与 `Waste Collected` 不是同一指标。
3. Graphs 的 Energy Consumed 是 BSF 按设备状态计算的，不是厂家 `powerConsume`。
4. Graphs/Reports 的 GHG 是 BSF 计算公式，不是厂家 `saveCarbon`。
5. Raw Data 来自本地采集表，不是前端直接读取厂家 WebSocket。
6. Machines 和 Locations 的当前状态来自厂家 `deviceOnline` 与最新持久化状态。
7. Clients、Users 的归属关系和角色主要来自本地数据库。
8. Alerts 的 CO₂/NO₂/H₂S 阈值与 Sample Alert 目前是静态值。
9. System Settings 的部分字段仍是界面占位，不代表已保存的配置。
10. Logs 页面当前没有真实数据源接入。

## 单位与换算

| 字段 | 原始单位 | 前端显示 | 换算 |
| --- | --- | --- | --- |
| `input.dailyInput`、`weeklyInput`、`monthlyInput`、`yearlyInput` | 吨 | kg | × 1000 |
| `TotalAddMaterial` | 吨 | kg | × 1000 |
| `TotalDischarge` / `OtalUnloadingWeight` | 吨 | kg | × 1000 |
| `DailyFeedWeight` | kg | kg | 不换算 |
| `RealTimeWeight` | 厂家未明确 | kg | 当前按原值展示 |
| `CabinTemp` | °C | °C | 不换算 |
| `Humidity` | 小数或百分比 | % | 小于等于 1 时按配置乘以 100 |
| `kitchenWaste` | 厂家未明确 | kg | 当前乘配置因子，默认 1 |
| `powerConsume` | 厂家未明确 | kWh | 当前不作为 Reports 展示能耗 |

## 缺失值规则

- 厂家真实返回 `0`：显示 `0`。
- 厂家字段缺失或无效：显示 `—`。
- 接口请求失败：显示错误状态，不补造数据。
- 厂家日报为空：只影响依赖日报的字段，不应清空遥测字段。
- GHG 公式不完整：显示 `—`，不使用默认 GHG 结果。

## 日报长期保存

| 数据 | 保存位置 | 同步规则 |
| --- | --- | --- |
| 每日厨余处理量 | `vendor_daily_stats.kitchen_waste_kg` | 厂家 `kitchenWaste` × 配置因子 |
| 每日运行时间 | `vendor_daily_stats.run_time_hours` | 厂家 `runTime` |
| 厂家日报耗电 | `vendor_daily_stats.vendor_power_consume_kwh` | 只作审计，不覆盖 BSF 的状态能耗 |
| 厂家节省碳排 | `vendor_daily_stats.saved_carbon_kg` | 只作审计，不替代 BSF GHG |
| 输出量 | `vendor_daily_stats.unloading_weight_raw` | 保留厂家原值 |

- `Telemetry Worker` 每 30 分钟同步一次日报。
- 每台设备首次同步回填最近 60 天，之后滚动刷新最近 3 天。
- 数据库同时保存厂家原值；读取时按当前 kg/kWh 因子重新计算，避免因子调整后历史口径不一致。
- Reports 优先使用本地日报，再合并厂家最近 60 天结果；厂家不可用时不清空已保存数据。
- 不存在的日报保持缺失，不补零。
- `RealTimeWeight` 是设备模板点位，只在 Machines/Raw Data 展示，不参与 Food Waste In、GHG 或肥料计算。
