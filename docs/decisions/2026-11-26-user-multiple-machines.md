# ADR-2026-11-26: 普通用户多设备授权

## 背景

BSF 原先通过 `users.machine_id` 限制一个普通用户只能访问一台 Machine。厂家子用户设备分配已经支持多台设备，但 BSF 本地没有对应关系，导致厂家分配成功后用户页面和数据权限仍显示为空或只覆盖一台。

## 决策

1. 新增 `user_machines` 多对多关系表，主键为 `(user_id, machine_id)`，用户或机器删除时关系级联删除。
2. 迁移现有 `users.machine_id` 到 `user_machines`，并将 `users.machine_id` 仅保留为兼容字段。
3. 厂家设备分配保存成功后，按最终 `assignedList` 整体替换该用户的 `user_machines`。
4. 登录会话返回 `machineIds` 数组；普通用户的机器、图表、报表、原始数据和设备数据权限全部按该集合过滤。
5. User Management 表格显示完整的 Assigned Devices 列表。
6. 用户编辑表单不再修改设备绑定；设备统一通过 Devices 分配窗口管理，避免编辑资料时覆盖多设备关系。
7. 如果厂家分配的设备还没有本地 Machine 映射，保存操作在调用厂家前返回冲突错误，避免出现厂家成功但本地无法授权的半完成状态。

## 影响模块

- `backend/db/migrations/019_user_machine_assignments.sql`
- `backend/src/middleware/session.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/directory.js`
- `backend/src/routes/device-data.js`
- `backend/src/routes/analytics.js`
- `backend/src/routes/vendor-users.js`
- `backend/src/services/vendor-analytics.js`
- `src/ui/state.js`
- `src/ui/backend-data.js`
- `src/ui/pages/users.js`

## 验证要求

- 旧单设备关联迁移后仍可访问。
- 普通用户可以访问多台已分配 Machine，且不能访问未分配 Machine。
- 厂家分配空数组时清空本地设备权限。
- 厂家分配集合变化时整体替换本地关系，不做增量残留。
- User Management 显示全部设备名称。
- 编辑用户资料不会清空 Devices 中已经分配的多设备关系。

## 部署顺序

1. 备份数据库。
2. 执行 `019_user_machine_assignments.sql`。
3. 部署后端。
4. 部署前端。
5. 重新登录普通用户以获取新的 `machineIds` 会话数据。

本次只生成迁移，不授权或执行生产迁移。
