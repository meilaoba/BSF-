# HTTPS 与服务器迁移安全基线

## 目标架构

```text
Browser
  -> HTTPS :443 (Nginx, TLS termination)
     -> 127.0.0.1:4180 (frontend)
     -> 127.0.0.1:3000 (backend API)
```

- 本地演示继续使用 `http://127.0.0.1:4180`，不强制本机 HTTPS。
- 生产环境只公开 Nginx 的 `80/443`，Node 服务只监听 loopback。
- HTTP `80` 只用于证书续期和 `308` 跳转到 HTTPS。
- 数据库、应用密钥和厂商 Token 只放在服务器环境文件中，不进入 Git。

## 普通 HTTP 迁移步骤

1. 准备域名，并把域名 A/AAAA 记录指向服务器。
2. 安装 Nginx、Node.js 20+ 和 PostgreSQL。
3. 将前端放到 `/var/www/bsf-frontend`，后端放到 `/var/www/bsf-backend`。
4. 为域名申请证书，例如：

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d bsf.example.com
```

5. 复制并修改 `backend/deploy/nginx-tls-site.conf`：
   - 将 `bsf.example.com` 全部替换成正式域名；
   - 确认证书路径正确；
   - 把文件放到 `/etc/nginx/sites-available/bsf` 并启用。
6. 将 `backend/deploy/nginx-bsf-limits.conf` 放入 `/etc/nginx/conf.d/`。
7. 执行 `sudo nginx -t && sudo systemctl reload nginx`。

## 生产环境变量

后端至少必须包含：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PUBLIC_ORIGIN=https://bsf.example.com
TRUST_PROXY=true
REQUIRE_HTTPS=true
CORS_ALLOWED_ORIGINS=https://bsf.example.com
AUTH_REQUIRED=true
VENDOR_AUTH_ENABLED=true
AUTH_COOKIE_SECURE=true
INTERNAL_API_KEY=<至少 24 字符的随机值>
AUTH_TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>
```

生产启动时会执行 fail-fast 检查。以下任一情况都会阻止后端启动：

- 缺少 `PUBLIC_ORIGIN`，或它不是 HTTPS。
- 未启用 `TRUST_PROXY` / `REQUIRE_HTTPS`。
- CORS 使用 `*` 或包含 HTTP 来源。
- 未要求认证，或 Cookie 未启用 `Secure`。
- `INTERNAL_API_KEY` 少于 24 字符。

`backend/.env.example` 是可复制模板。正式环境文件应设置为 `chmod 600`，且只由服务账号读取。

## 服务启动

```bash
sudo cp backend/deploy/bsf-backend.service /etc/systemd/system/
sudo cp backend/deploy/bsf-notification-worker.service /etc/systemd/system/
sudo cp deploy/bsf-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bsf-backend bsf-notification-worker bsf-frontend
```

## 上线验收

```bash
# 1. HTTP 必须跳转到 HTTPS
curl -I http://bsf.example.com/

# 2. 后端在无有效会话时不能返回业务数据
curl -i https://bsf.example.com/api/v1/clients

# 3. 公开健康检查不能泄露数据库或队列信息
curl -s https://bsf.example.com/api/v1/health

# 4. Node 端口不应能从公网访问
curl --connect-timeout 3 http://SERVER_PUBLIC_IP:3000/
curl --connect-timeout 3 http://SERVER_PUBLIC_IP:4180/
```

预期结果：HTTP 返回 `308`；受保护 API 返回 `401`；公开健康检查只返回 `ok/time`；`3000/4180` 公网连接失败。

## 已落实的应用层防护

- 会话 Cookie：`HttpOnly`、`SameSite=Strict`、生产 `Secure`。
- 状态修改请求：CSRF Token 校验。
- 登录：厂商侧认证、服务端 Token 加密、失败限流与审计。
- 代理 IP：仅信任 Nginx 覆盖的 `X-Real-IP`，不再信任可伪造的 `X-Forwarded-For` 首项。
- 权限：统一规范化路径，阻止通过 `/clients/xxx` 等子路径绕过角色限制。
- 健康检查：公开接口只暴露最小状态，详细数据库和队列信息需要服务密钥或 Master Admin 会话。
- 请求体：API 最大 `256 KB`，超限返回 `413`。
- 响应头：禁止缓存、禁止 MIME 嗅探、禁止 iframe 嵌入、限制浏览器权限。
- 限流隔离：登录接口使用独立额度；图表读取按浏览器标签页实例单独计数，避免旧页面重试耗尽全站 API 额度。
- 图表失败保护：请求失败后页面停止自动重试，只允许用户显式点击 Retry，避免形成请求循环。
- 上传头像：只允许 PNG/JPEG/WebP/GIF，最长 1 MB，并校验 URL/Data URL 类型。

## 需要在上线前确认

- 域名和证书必须固定；证书稳定前不要启用 HSTS。模板中的 HSTS 配置默认注释。
- 当前页面仍使用内联事件处理器，因此 CSP 暂时保留 `unsafe-inline`。若要进一步收紧 CSP，需要单独一轮前端事件绑定改造，不能直接删除该配置，否则现有按钮会失效。
- 生产环境必须只允许 Nginx 访问 Node 端口；云安全组不要开放 `3000`、`4180`、`5432`。
- 备份数据库和 `/etc/bsf-backend.env` 时必须加密，不能上传到 GitHub。
