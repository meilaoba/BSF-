# 交付架构

## 分层

~~~text
设备
  → 厂家 REST API
  → BSF 后端（认证、标准化、持久化）
  → PostgreSQL
  → HTTP API
  → 结构化 Web 前端
~~~

## 前端边界

前端负责：

- 页面和原版样式
- Client / Machine Filter
- 图表和列表显示
- 调用同源 `/api/v1` 后端接口
- 错误和空数据状态

前端不负责：

- 保存厂家 Token
- 直接连接厂家系统或设备网络
- 保存历史数据
- 绕过后端做权限判断

## 数据流

1. 用户通过 BSF 后端登录，厂家 Token 只保存在服务端加密会话中。
2. `/api/v1/vendor-devices` 代理厂家设备列表。
3. `/api/v1/machines` 提供客户与机器资料。
4. `/api/v1/device-data` 提供历史遥测。
5. 页面使用同一份后端数据渲染 Machines、Locations、Graphs、Raw Data、
   Reports 和 Alerts。
6. 未绑定客户或机器的厂家设备显示为 `Unassigned`，系统不会自动绑定。
