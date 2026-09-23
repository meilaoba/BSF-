# BSF Smart Kitchen Waste IoT

BSF 智慧厨余平台前端正式交付工程。

## 在本机运行

前置条件：

- Node.js
- 客户提供的 `bms_mos.exe`
- 对应的 `config.json`

目录建议：

~~~text
项目目录/
├─ bsf-delivery/          从 GitHub 拉取的前端
├─ bms_mos.exe            客户提供的本地网关
├─ config.json             客户提供的本地配置
└─ bms_mos.log
~~~

启动：

~~~powershell
cd bsf-delivery
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
