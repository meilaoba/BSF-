# bms_mos 网关协议

## 配置来源

本地测试配置文件位于项目根目录：

~~~text
../config.json
~~~

其中包含 MQTT Broker、Topic、用户名和密码。该文件只用于本机采集服务，
不得复制到浏览器代码或交付前端。

## 本地 HTTP API

bms_mos.exe 启动后会在日志中输出：

~~~text
[http] API listening on http://127.0.0.1:<port>
~~~

已确认接口：

| 接口 | 用途 |
|---|---|
| GET /api/health | 网关状态和缓存记录数 |
| GET /api/latest | 最新一条消息 |
| GET /api/messages?limit=N | 最近 N 条消息 |

响应统一为：

~~~json
{ "code": 0, "message": "ok", "data": {} }
~~~

## 前端接入规则

- 浏览器只访问 HTTP API，不读取 config.json。
- 网关地址由 runtime config 或 URL 参数提供。
- 网关只作为联调数据源，不作为正式历史数据库。
- 正式上线前必须由正式后端提供同样的数据结构和权限接口。
