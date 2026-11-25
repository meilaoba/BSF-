# ADR-2026-11-25: Reports Excel 恢复为前端本地生成

## 背景

厂家 `/export/table` 返回的日报指标在当前 60D 数据中全部为 0，而 BSF Reports 页面已经显示自己的汇总结果。继续使用厂家 Excel 会导致页面数值和下载文件不一致，并引入厂家 Token、空文件判断和日期排他规则等额外复杂度。

## 决策

1. Reports 的 `Export Excel` 不再调用 `/api/v1/exports/device-data`。
2. Excel 使用当前 Reports 周期内的原始样本行生成三个独立工作表：
   - `Weight`：Recorded Time、Device、Weight(kg)
   - `Temp`：Recorded Time、Device、Temp(°C)
   - `Humidity`：Recorded Time、Device、Hum(%)
3. 文件在浏览器本地下载，不经过厂家导出接口。
4. 导出保留当前页面可见的指标、单位和日期维度。
5. Alerts 的报警文件导出暂不包含在本次回退范围内。

## 影响

- `src/ui/pages/reports.js`
- `test/reports-export.test.js`
- `docs/frontend-data-source-map.md`

厂家 `/export/table` 代理接口可以保留供后续单独测试，但 Reports 页面不再使用。
