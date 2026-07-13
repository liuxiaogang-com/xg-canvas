# 授权(RBAC)规范

> 两层作用域的**权限制 RBAC**:`permissions`(能力目录)+ `roles`(权限包)+ `role_bindings`(user × role × scope)。一个 capability key 同时是 DB 行、后端 `@RequirePerm` 参数、前端 `can()` 参数——**这就是"组件级"权限的根**。实现见 `apps/canvas-api/src/authz/`。

## 1. 模型

```
Scope          system | project          权限在哪个边界生效
Capability     <scope>.<resource>.<action>   原子权限点(catalog.ts 为唯一事实来源)
Role           能力的命名集合(内置 is_system / 企业自定义)
RoleBinding    (user, role, scope)        system 绑定 scope_id=NULL(覆盖所有项目);project 绑定 scope_id=project_id
```

**有效权限解析**(`AuthzService.resolveCapabilities`):
```
effective(user, scope) =
    系统绑定的全部能力                       (系统角色可含 project 能力 → 适用于所有项目)
  ∪ (scope=project 时) 该 project 绑定的能力
super_admin / is_instance_owner → 短路返回全集
```
即"**系统覆盖项目**":`sys_admin` 的 `project.read` 通过 system 绑定下发 → 对每个项目都成立(跨项目排查),无需逐项目建绑定。

## 2. 五个内置角色(`catalog.ts`,seed 灌入)

| key | scope | 边界 |
|---|---|---|
| `it_super_admin` | system | 全权(短路)+ `is_instance_owner` 兜底;唯一能授超管/动 config-sync |
| `sys_admin` | system | 用户/凭证/模型/计费/日志运营 + 跨项目只读(`project.read`);默认不授跨项目写 |
| `project_admin` | project | 单项目:成员管理、设置/归档、画布全编辑、任务、资产删任意 |
| `project_member` | project | 编辑节点、跑任务、传/删资产(删受 owner 约束) |
| `project_guest` | project | 只读:`project.read` / `project.task.view` / `project.asset.view` |

## 3. 权限目录命名

`<scope>.<resource>.<action>`,粒度落在**前端组件语义**而非接口。action 收敛:`view/read`、`create`、`edit`、`delete`、`manage`、`run`。完整 21 条见 `catalog.ts`(system 12 + project 9);`is_dangerous` 的(如 `system.user.assign_super_admin`、`system.config.sync`、`system.request_log.manage`)自定义角色不可随意勾;`has_condition` 的(`project.asset.delete` owner、`project.settings.manage` 归档态)放行后仍走资源二判。

## 4. 后端落地

- **守卫**:全局两道 `APP_GUARD`,顺序固定 `SessionGuard`(认证,设 `req.user`)→ `PermissionGuard`(读 `@RequirePerm`)。未标 `@RequirePerm` 的路由第二道直接放行。
- **声明**:`@RequirePerm('project.canvas.node.edit', { scope:'project', from:'param', key:'projectId' })`。`scope=project` 时从 `param|body|query` 取 project_id,**取不到即 deny**(不静默放行)。两类例外:① 同一端点也服务 `project_id IS NULL` 资源(gen.text 任务 / workspace 资产列表)时加 `optional:true`——缺 project_id 则跳过、回落各 service 的 `owner_id` + `assertMember`;② sentinel `project_id='global'` 视同无项目。
- **守卫覆盖不到的写**:`entity` 的 update/delete 把 project_id 挂在实体上(不在请求里),guard 无从解析 → 这类在 **service 内**用同一 `AuthzService.can()` + 同一 key 判定。
- **创建即拥有**:运行时新建 project,创建者当场写入 `project_admin` 绑定(不止启动回填),否则 RBAC 一上线创建者反而无权编辑自己的画布。
- **系统管理面**:`credential / provider / channel / model-definition / registry / config-sync / dreamina / billing / request-log` 九个控制器已从旧 `AdminGuard`(二元 env `ADMIN_EMAILS`)迁到 `@RequirePerm(system.*)` —— 凭证=`credential.manage`、供应商/模型/通道=`model.manage`、registry/config-sync/dreamina=`config.sync`、计费=`billing.view`、日志读=`request_log.view`/清理=`request_log.manage`。`AdminGuard` 退役,系统权限一律走 RBAC,可细分。
- **缓存**:`xgcanvas:authz:caps:{user}:{scope}:{scopeId}`,TTL 300s;任何 binding/role 写操作调 `AuthzService.invalidate(userId)` 清该用户全部缓存键;改内置角色权限(seed reload)按角色 `invalidateByRoleId` 清全体持有者。
- **审计**:`authz_audit` 记所有 deny + binding.grant/revoke(`AuthzService.audit`,best-effort)。
- **租户门**:项目操作仍过 service 的 `assertMember`(workspace 成员存在性);`assignProjectRole` 在授项目角色时一并保证 workspace 成员行存在。

## 5. 超管护栏(五层)

1. **bootstrap**:空实例通过 `/setup` 初始化页，在事务内创建首位本地管理员、写入 `it_super_admin` system 绑定并设置 `is_instance_owner=true`；初始化状态永久落库，advisory lock + 行锁保证并发时只能产生一个 Owner。无 Token 模式要求部署者先完成初始化再开放公网，普通注册/登录在此之前均被阻断。
2. **不可归零**:`setSystemRole` 降级/移除超管前 `assertNotLastSuperAdmin`,**判定在事务内 + `FOR UPDATE` 行锁**串行化(防两个并发降级都通过把超管清零),归零则 `409 LAST_SUPER_ADMIN`。
3. **授系统角色须超管**:授予 `sys_admin` / `it_super_admin` 都要 `system.user.assign_super_admin`(只有超管能造系统角色,杜绝 sys_admin 自我繁殖)。
4. **不被合并吞掉**:`fullMerge` 拒绝目标是超管/`is_instance_owner`(防借合并窃权);`isSuperOrOwner` 只认 `active && 未合并`;silent_merge 路径把系统绑定 + owner 标志转移给存活方,任何路径都不会把最后超管/owner 合并丢失。
5. **break-glass**:`is_instance_owner` 在 `isSuperOrOwner` 并入全权;DB 单行唯一索引 `ux_users_single_instance_owner` 保证至多一个 owner。

## 6. 前端落地

- `usePermStore` 持 systemCaps(`/me/permissions`)+ 按 project 懒加载的 caps(`/projects/:id/permissions`,后端已并入系统能力)。
- 三档门控:`RoleGate`(路由:有任一 system 能力才进 `/settings`)、`<Can perm project>`(区块)、`can()`(按钮/输入 readOnly)。
- 同一份 capability key 三处同源 → 游客进项目所有 `.edit/.run/.delete/.manage` 组件自动只读/隐藏。
- **画布组件级只读**:`CanvasPage` 进项目即 `loadProject(pid)`,把 `project.canvas.node.edit` 写进 `useCanvasUI.canEdit`(单一真相)。无权时:节点不可拖/连(`nodesDraggable/Connectable=false`)、Dock 加节点隐藏、节点工具栏不渲染、右键菜单去掉副本/删除、内联表单 `pointer-events:none`,顶部显示"只读模式"横幅。同一编辑器 A 可改、B 只读即由此实现。
- **Settings 子页细分**:`SettingsLayout` 按各 tab 声明的 system 能力(`credential.manage`/`model.manage`/`config.sync`/`request_log.view`/`billing.view`…)过滤,缺权能的 tab 直接不显示。
- 管理面:项目成员页(`project.member.manage` 才显增删改)、系统用户角色页(`system.user.manage`;授超管选项需 `assign_super_admin`)。

## 7. 收编旧机制

- `workspace_members.role`(旧死字段)→ 保留列做纯租户归属,角色语义全上移到 `role_bindings`。
- 旧 env `ADMIN_EMAILS` 与 `SETUP_TOKEN` 已删除；首次授权只走不可重复的 Setup 流程。运行时鉴权一律查 `role_bindings`。会话里的 `role` 仅向后兼容,不再是真相源。

## 8. 刻意不做

- 不上 ReBAC/Zanzibar/OPA;ABAC 只认 owner/status/field 三原语,不做通用规则引擎。
- token 不塞权限(服务端实时解析,保证即时撤权)。
- 节点级不建对象(统一 `project.canvas.node.edit`)。
- 自定义角色编辑器 UI 待后续(schema 与"鉴权读 role_permissions"已就位,开 UI 零改判定)。
