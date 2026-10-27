# BSF Smart Kitchen Waste IoT

BSF 智慧厨余平台前端正式交付工程。设备数据统一通过已认证的厂家 REST API
进入后端，无需额外的本机采集程序。

## 从 GitHub 拉取

~~~powershell
git clone https://github.com/meilaoba/BSF-.git
cd BSF-
~~~

## 在本机运行

前置条件：

- Node.js 20+
- BSF 后端服务可访问
- 厂家 API 的账号、密钥与地址已配置在后端环境变量中

启动前端：

~~~powershell
cd BSF-
$env:BSF_BACKEND_URL = 'http://127.0.0.1:3000'
npm run dev
~~~

浏览器打开：

~~~text
http://127.0.0.1:4180/
~~~

后端 API 通过同源代理访问：

~~~text
Web 前端
  → http://127.0.0.1:4180/api/v1
  → BSF 后端
  → 厂家 REST API
~~~

厂家 Token 只保存在后端加密会话中，不会进入浏览器、前端源码或日志。

## 目录

~~~text
index.html
src/api/          后端 REST API 客户端
src/config/       运行时配置
src/services/     数据服务
src/ui/           页面与界面
src/styles/       样式
scripts/          前端开发服务器
docs/             架构、安全与部署说明
backend/          BSF 后端、数据库迁移和通知队列
~~~

## 数据加载规则

- 页面只调用 `/api/v1`。
- 设备清单来自 `/api/v1/machines` 与 `/api/v1/vendor-devices`。
- 历史遥测来自 `/api/v1/device-data` 与 `/api/v1/vendor-devices/history`。
- Master Admin 每 3 分钟、Client Admin / User 每 10 分钟读取一次最新记录。
- 轮询结果追加到按角色和账号隔离的本地历史缓存，不覆盖旧记录。
- 相同设备与上报时间去重；没有上报时间且数值未变化的实时快照不会重复保存。
- 未绑定客户或机器的厂家设备显示为 `Unassigned`，不会自动建立关联。
- 前端不保存厂家凭据，不连接设备网络，不生成模拟业务数据。

---

## 后端服务（backend/）

后端负责登录认证、厂家 API 代理、设备遥测、客户与用户资料、告警规则、
Email / WhatsApp 通知队列和审计日志。

生产环境使用 Nginx 终止 HTTPS，Node 前端与后端只监听 `127.0.0.1`。完整的
域名、证书、环境变量、systemd 与上线验收步骤见
[`docs/security-deployment.md`](docs/security-deployment.md)。

~~~text
backend/
├─ src/server.js          HTTP API（Node 内置 http，无框架依赖）
├─ src/worker.js          后台通知队列 worker
├─ src/config.js          读取 /etc/bsf-backend.env
├─ src/db.js              PostgreSQL 连接池、事务、审计
├─ src/providers/         vendor-devices.js / email.js / whatsapp.js
├─ src/services/          遥测归一化、通知队列、告警分发
├─ src/routes/            auth / health / directory / device-data / vendor-devices
├─ db/migrations/         数据库结构与增量迁移
└─ scripts/smoke-test.sh  自检脚本
~~~

### 当前状态

| 项目 | 状态 |
| --- | --- |
| PostgreSQL 数据库与全部表结构 | 已完成 |
| 厂家登录与设备列表 API 代理 | 已完成 |
| 设备遥测存储与查询模型 | 已完成 |
| 通知队列（重试、退避、投递日志、审计） | 已完成 |
| Clients / Machines / Users 数据接口 | 已完成 |
| Email 厂商 API 对接 | 等待客户提供 API 文档与账号 |
| WhatsApp 厂商 API 对接 | 等待客户提供 API 文档与账号 |

### 接口清单

~~~text
GET  /api/v1/health                      服务就绪状态
GET  /api/v1/meta/providers               Email / WhatsApp 配置状态
GET  /api/v1/notifications/logs           投递历史
POST /api/v1/notifications/send           发送通知（入队）
POST /api/v1/notifications/test/email     测试邮件
POST /api/v1/notifications/test/whatsapp  测试 WhatsApp
POST /api/v1/alerts/temperature           温度阈值判断 + 分发告警
GET|POST|PUT|DELETE /api/v1/clients       客户
GET|POST|PUT|DELETE /api/v1/machines      设备（含客户关联）
GET  /api/v1/vendor-devices              厂家设备列表（只读代理）
POST /api/v1/vendor-devices/sync         同步厂家设备资料（不自动绑定）
GET  /api/v1/device-data                 历史遥测查询
POST /api/v1/device-data/ingest          遥测写入
GET|POST|PUT|DELETE /api/v1/users         Master Admin / Client Admin / User
GET|PUT /api/v1/notification-preferences  通知偏好
GET|PUT /api/v1/alert-thresholds          每台设备的温度阈值
GET  /api/v1/audit-logs                   操作审计
~~~

### 权限与数据可见范围

- **Master Admin**：可见全部客户与设备。
- **Client Admin**：只属于一个客户，界面不提供 Client 筛选。
- **User**：只关联一台设备。

后端接受 `clientId` / `machineId` 参数实现范围过滤；Client Admin 与 User
登录后，后端会用会话中的客户/设备范围覆盖浏览器传入的参数。

### 部署与自检

~~~bash
cd /var/www/bsf-backend
npm install --omit=dev
set -a; . /etc/bsf-backend.env; set +a
npm run migrate

systemctl status bsf-backend bsf-notification-worker
bash scripts/smoke-test.sh
~~~

`/etc/bsf-backend.env` 保存数据库密码与厂家密钥，权限为 `600`，不会上传到 GitHub。
