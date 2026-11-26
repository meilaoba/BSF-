# ADR-2026-11-26: 厂家子用户生命周期与设备分配

## 背景

BSF 已经通过厂家 `/user/add` 创建子用户，并在首次登录时把厂家 `userId` 关联到本地 `users.vendor_user_id`。现有用户页面只能读取和修改本地记录，不能查询厂家账号全量列表、同步修改或删除厂家账号，也不能把厂家设备分配给子用户。

厂家 `/user/list` 只返回启用的子用户；`/emDeviceAssign/allocateEquipment` 使用最终集合覆盖语义，空数组表示清空全部设备。

## 决策

1. 保留 BSF 本地 UUID 作为平台身份，厂家 `userId` 只保存在 `vendor_user_id`，两者不混用。
2. 厂家账号存在性和设备分配关系以厂家为准；BSF 本地角色、Client、Machine、审计和通知关系以本地数据库为准。
3. `GET /api/v1/vendor-users` 合并厂家子用户和匹配的本地用户；未关联本地记录时标记为 `isManaged=false` 并保持只读。
4. 已关联用户修改时先调用厂家 `/user/update`，成功后再更新本地用户。厂家支持字段限定为用户名、手机号、头像和启用状态。
5. 已关联用户删除时先调用厂家 `/user/delete`，成功后删除本地用户。厂家返回目标已不存在时按幂等删除处理。
6. 设备分配通过 `GET|PUT /api/v1/vendor-users/assignments`：
   - GET 返回厂家 `assignedList` 和 `unassignedList`，并补充本地 Machine 映射。
   - PUT 提交最终保留的完整 `deviceId` 数组，空数组表示全部取消。
7. `fromUserId` 和厂家目标 userId 都由后端从已认证会话及本地 `vendor_user_id` 解析，不接受浏览器任意指定。
8. 新增用户密码继续使用 AES-CBC + Base64；本流程不使用 MD5。
9. 厂家成功但本地更新或删除失败时，接口必须返回明确的同步失败错误并写审计，不能报告完全成功。
10. 未关联本地用户的厂家账号可通过 `DELETE /api/v1/vendor-users?vendorUserId=...` 删除。服务端必须先确认目标出现在当前厂家账号的 `/user/list` 中，并拒绝删除已关联本地用户的账号。

## 影响模块

- `backend/src/providers/vendor-user.js`
- `backend/src/providers/vendor-user-devices.js`
- `backend/src/routes/vendor-users.js`
- `backend/src/routes/directory.js`
- `backend/src/middleware/session.js`
- `backend/src/config.js`
- `src/ui/pages/users.js`
- `src/ui/backend-data.js`

## 接口与数据约束

- 厂家列表查询分页上限为 20 页，每页 100 条。
- 不能把厂家列表中暂时缺失的禁用用户自动当作已删除。
- 分配写操作必须提交完整最终集合，不能只提交新增设备。
- 一次只能给一个厂家子用户分配设备。
- `userIdList` 虽以 List 命名，实际必须是单个整数。

## 验证要求

- 厂家查询、修改、删除和分配请求的参数、Header token 与 URL 有单元测试。
- 修改和删除顺序必须为厂家成功后本地持久化。
- 分配写接口在提交后重新查询并验证最终分配结果。
- 空设备数组可以清空全部分配。
- 未登录、最终客户角色和跨客户操作被服务端拒绝。
- 未纳管账号删除必须先验证厂家归属；已纳管账号不能绕过本地同步删除接口。
- 新增用户密码示例继续匹配 AES-CBC + Base64。

## 未验证项

- 尚未使用真实厂家账号执行修改、删除或设备分配 E2E。
- 厂家成功后本地数据库失败时的人工核对流程仍需部署后演练。
