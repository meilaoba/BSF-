# 交付架构

## 分层

~~~text
设备
  → MQTT Broker
  → bms_mos.exe / 正式数据服务
  → 后端 API 与历史数据库
  → HTTP API / WebSocket
  → 结构化 Web 前端
~~~

## 前端边界

前端负责：

- 页面和原版样式
- Client / Machine Filter
- 图表和列表显示
- 调用后端 API
- 调用本地网关 API（开发联调）
- 错误和空数据状态

前端不负责：

- 保存 MQTT 密码
- 直接连接 MQTT TCP
- 保存一年历史数据
- 绕过后端做权限判断

## 运行模式

### 1. 本机联调模式

页面从 bms_mos.exe 的本地 HTTP API 读取实时数据：

~~~text
GET /api/health
GET /api/latest
GET /api/messages?limit=N
~~~

网关端口每次启动可能变化，前端通过 runtime config 或 URL 参数传入。

### 2. 正式后端模式

页面从正式后端读取：

- 登录和权限
- 客户、用户、角色
- 机器和历史数据
- 报表、告警、系统设置

正式模式不在前端保存 MQTT 凭据。
