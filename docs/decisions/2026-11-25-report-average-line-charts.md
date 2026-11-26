# ADR-2026-11-25: Reports 使用 Weight、Temperature、Humidity 平均折线

状态：已被 `2026-11-26-restore-food-waste-input-metrics.md` 取代。

## 背景

Reports 原有 Food Waste In 图表读取厂家 `input.dailyInput`。客户确认报告中的
Waste-in 口径为 `RealTimeWeight`：本月唯一 weight 记录先整体求平均，再乘以
当月实际天数得到月总量。

## 决策

- 月报横轴固定为当月实际天数。
- 月报图表的第 n 天使用当天有效 weight 采样的算术平均。
- 年报表的每个月份点使用该月有效 weight 采样值的算术平均。
- Reports 的 Waste-in 汇总使用查询周期内全部唯一 weight 采样的总平均值；
  当前唯一键为设备 ID + 采集时间。
- Month Total = 周期 weight 平均值 × 有效在线天数。
- GHG Reduced 的厨余减排项使用上述 Waste-in；Est. Fertilizer 同样使用 Waste-in。
- 缺失日保持空白，不补零，也不跨缺失日连接折线。
- Reports 的 Excel Weight 日聚合同样使用当天平均值。
- Reports 在 Weight 折线图下方显示 Temperature 和 Humidity 平均折线图。
- Reports 的 Waste Collected 卡片同样使用 Weight 推导的 Total Waste-in，不再读取
  `kitchenWaste` 或 `input.dailyInput`。
- 负值 weight 按缺失读数处理；0 kg 是有效读数，参与平均值并绘制。
- Offline 日不作为有效计算日：Weight、Temperature、Humidity、GHG 和 Fertilizer
  均不使用 Offline 数据，也不计入 Total Waste-in 的有效天数。
- Graphs 页的 Food Waste In 和 Reports 的 Waste Collected 继续使用原有权威字段，
  不因本决策改变。

## 被拒绝的方案

- 用每日平均值再求平均：采样数量不同的日期会获得不合理权重。
- 用每天最大 weight 代替日均值：不符合客户确认的业务定义。
- 把原始采样和日均值混在同一条折线中：会产生竖线歧义，也无法区分范围和均值。
- 使用每天最低到最高值的竖线范围：客户确认不需要，统一改为平均值折线。

## 影响范围

- `backend/src/services/vendor-analytics.js`
- `backend/src/routes/analytics.js`
- `src/ui/pages/reports.js`
- `src/ui/report-xlsx.js`

## 后续验证

- 月报横轴 28/29/30/31 天与所选月份一致。
- 日均值、周期总平均值和月总量可从接口响应与原始样本复核。
- 缺失日保持空白。
- 年报表的月度值等于该月全部唯一 weight 采样值的平均。
