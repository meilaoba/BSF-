# ADR-2026-11-27: 接入修改密码与子用户密码重置

## 决策

1. Account 页通过 `POST /api/v1/auth/change-password` 修改当前登录用户密码。
2. 后端从会话取得 `vendorUserId`，浏览器不能指定其他厂家用户 ID。
3. 厂家 `oldPassword` 使用当前明文的 32 位大写 MD5。
4. 厂家 `newPassword` 使用 AES-CBC + Base64，复用添加子用户的密码加密规则。
5. 新旧密码不能相同，新密码长度为 8–256 个字符。
6. Users 页通过 `POST /api/v1/vendor-users/reset-password` 重置子用户密码。
7. 重置前必须从当前厂家账号的 `/user/list` 确认目标用户，禁止任意 ID 越权。
8. 重置后的临时密码固定为 `123456`。
9. 修改和重置操作写入审计日志，但不记录任何明文密码或密码密文。
10. 密码接口不新增数据库表或字段。

## 安全边界

- Client Admin 只能重置当前厂家账号子用户列表中的目标。
- User 不能访问管理员密码重置路由。
- 未分配设备的 User 仍可修改自己的密码。
- 所有写请求继续要求 CSRF 校验。

## 验证

- 厂家 `/user/updatePassword` 请求体字段和加密方式正确。
- 厂家 `4003` 映射为“当前密码错误”。
- `/user/resetPassword` 仅传 `id`。
- 前端 API、Account 表单和 Users 操作入口完成对接。
