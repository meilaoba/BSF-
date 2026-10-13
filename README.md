# BSF Smart Kitchen Waste IoT

BSF 智慧厨余平台前端正式交付工程。

## 从 GitHub 拉取

~~~powershell
git clone https://github.com/meilaoba/BSF-.git
cd BSF-
~~~

## 在本机运行

前置条件：

- Node.js
- 客户提供的 `bms_mos.exe`
- 对应的 `config.json`

目录建议：

~~~text
BSF-/                      从 GitHub 拉取的前端
├─ index.html
├─ package.json
├─ bms_mos.exe            可放在仓库根目录或上一级目录
├─ config.json            可放在仓库根目录或上一级目录
└─ bms_mos.log            可与 config.json 放在一起
~~~

启动：

~~~powershell
cd BSF-
npm run dev
~~~

浏览器打开：

~~~text
http://127.0.0.1:4180/
~~~

启动流程：

1. 先启动 `bms_mos.exe`。
2. 运行 `npm run dev`。
3. 浏览器登录。
4. 前端通过 `/api/gateway` 读取本机网关数据。

## 数据交互

~~~text
Web 前端
  → http://127.0.0.1:4180/api/gateway
  → bms_mos.exe HTTP API
  → MQTT 设备
~~~

`config.json`、`bms_mos.exe`、日志和实际 MQTT 凭据不会上传到 GitHub。

## 目录

~~~text
index.html
src/api/          后端与本机网关 API
src/config/       运行时配置
src/services/     数据服务
src/ui/           页面与界面
src/styles/       样式
scripts/          开发服务器与网关检查
docs/             架构和接口说明
~~~

## 网关检查

~~~powershell
npm run check:gateway
~~~

该命令只读取本机配置和日志，不会输出 MQTT 密码。

---

## 后端服务（backend/）

后端负责 Email / WhatsApp 通知、客户与设备资料、告警规则与审计日志。
前端只负责界面，**所有需要长期保存的数据都由后端提供接口**。

~~~text
backend/
├─ src/server.js          HTTP API（Node 内置 http，无框架依赖）
├─ src/worker.js          后台通知队列 worker
├─ src/config.js          读取 /etc/bsf-backend.env
├─ src/db.js              PostgreSQL 连接池、事务、审计
├─ src/providers/         email.js / whatsapp.js ← 厂商适配层
├─ src/services/          通知队列、告警分发、模板渲染
├─ src/routes/            health / notifications / directory
├─ db/migrations/         数据库结构（clients / machines / users / 队列 / 日志）
└─ scripts/smoke-test.sh  自检脚本，当前 23 项全部通过
~~~

### 当前状态

| 项目 | 状态 |
| --- | --- |
| PostgreSQL 18 数据库与全部表结构 | 已完成 |
| 通知队列（重试、退避、投递日志、审计） | 已完成 |
| 告警规则（温度 >58℃ 或 <12℃ 触发） | 已完成 |
| Clients / Machines / Users 数据接口 | 已完成 |
| Email 厂商 API 对接 | **等待客户提供 API 文档与账号** |
| WhatsApp 厂商 API 对接 | **等待客户提供 API 文档与账号** |

### 关于 Email / WhatsApp

客户尚未提供厂商 API 文档与凭据，因此系统**不会伪造发送成功**：

- 消息一律先入队，状态为 `waiting_config`；
- 接口返回 `EMAIL_PROVIDER_NOT_CONFIGURED` / `WHATSAPP_PROVIDER_NOT_CONFIGURED`；
- 消息不会丢失，拿到文档后只需修改 `src/providers/` 下两个文件，
  数据库、队列、重试逻辑和前端接口都不需要改动。

### 接口清单

~~~text
GET  /api/v1/health                      服务、数据库、队列、厂商配置状态
GET  /api/v1/meta/providers               Email / WhatsApp 是否已配置
GET  /api/v1/notifications/logs           投递历史
POST /api/v1/notifications/send           发送通知（入队）
POST /api/v1/notifications/test/email     测试邮件
POST /api/v1/notifications/test/whatsapp  测试 WhatsApp
POST /api/v1/alerts/temperature           温度阈值判断 + 分发告警
GET|POST|PUT|DELETE /api/v1/clients       客户
GET|POST|PUT|DELETE /api/v1/machines      设备（含客户关联）
GET|POST|PUT|DELETE /api/v1/users         Master Admin / Client Admin / User
GET|PUT /api/v1/notification-preferences  通知偏好
GET|PUT /api/v1/alert-thresholds          每台设备的温度阈值
GET  /api/v1/audit-logs                   操作审计
~~~

### 权限与数据可见范围

- **Master Admin**：可见全部客户与设备。
- **Client Admin**：只属于一个客户，界面不提供 Client 筛选。
- **User**：只关联一台设备。

后端接受 `clientId` / `machineId` 参数实现上述范围过滤；
**后续接入登录会话后，必须由后端根据登录身份覆盖这两个参数，不能信任浏览器传入的值。**

### 部署与自检

~~~bash
# 依赖与数据库结构
cd /var/www/bsf-backend
npm install --omit=dev
set -a; . /etc/bsf-backend.env; set +a
npm run migrate

# 服务
systemctl status bsf-backend bsf-notification-worker

# 全量自检（会创建临时数据并在结束时删除）
bash scripts/smoke-test.sh
~~~

`/etc/bsf-backend.env` 保存数据库密码与厂商密钥，权限为 `600`，**不会上传到 GitHub**。