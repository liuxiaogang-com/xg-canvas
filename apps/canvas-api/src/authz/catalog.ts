/**
 * The capability catalog + built-in roles — the single source of truth, seeded
 * to canvas.permissions / canvas.roles on boot. A capability `key` is the same
 * string in the DB, in backend `@RequirePerm`, and in frontend `can()` — that
 * shared key is what makes permissions component-level.
 *
 * Naming: <scope>.<resource>.<action>. Granularity is the UI component, not the
 * HTTP route (e.g. project.canvas.node.edit gates the node inspector + save).
 */
export type Scope = 'system' | 'project';

export interface PermissionDef {
  key: string;
  scope_kind: Scope;
  grp: string;
  label_zh: string;
  has_condition?: boolean; // after allow, a thin owner/status/field check still runs
  is_dangerous?: boolean; // custom roles may not freely grant this
}

export const PERMISSIONS: PermissionDef[] = [
  // ── system ─────────────────────────────────────────────
  { key: 'system.user.manage', scope_kind: 'system', grp: 'system.user', label_zh: '用户管理' },
  {
    key: 'system.user.assign_super_admin',
    scope_kind: 'system',
    grp: 'system.user',
    label_zh: '指派超级管理员',
    is_dangerous: true,
  },
  { key: 'system.role.manage', scope_kind: 'system', grp: 'system.role', label_zh: '角色管理' },
  {
    key: 'system.credential.manage',
    scope_kind: 'system',
    grp: 'system.credential',
    label_zh: '凭证管理',
  },
  {
    key: 'system.credential.read_secret',
    scope_kind: 'system',
    grp: 'system.credential',
    label_zh: '查看凭证明文',
    has_condition: true,
    is_dangerous: true,
  },
  {
    key: 'system.model.manage',
    scope_kind: 'system',
    grp: 'system.provider',
    label_zh: '供应商/模型管理',
  },
  { key: 'system.billing.view', scope_kind: 'system', grp: 'system.billing', label_zh: '查看计费' },
  {
    key: 'system.billing.manage',
    scope_kind: 'system',
    grp: 'system.billing',
    label_zh: '管理费率',
  },
  {
    key: 'system.request_log.view',
    scope_kind: 'system',
    grp: 'system.audit',
    label_zh: '查看请求日志',
  },
  {
    key: 'system.request_log.manage',
    scope_kind: 'system',
    grp: 'system.audit',
    label_zh: '清理请求日志',
    is_dangerous: true,
  },
  {
    key: 'system.audit.view',
    scope_kind: 'system',
    grp: 'system.audit',
    label_zh: '查看授权审计',
    is_dangerous: true,
  },
  {
    key: 'system.config.sync',
    scope_kind: 'system',
    grp: 'system.ops',
    label_zh: '模型目录重载',
    is_dangerous: true,
  },
  {
    key: 'system.config.manage',
    scope_kind: 'system',
    grp: 'system.config',
    label_zh: '功能模型配置',
  },
  {
    key: 'system.content.manage',
    scope_kind: 'system',
    grp: 'system.content',
    label_zh: '管理工作区公共资产与资源库',
    has_condition: true,
  },
  // ── project ────────────────────────────────────────────
  { key: 'project.read', scope_kind: 'project', grp: 'project.base', label_zh: '打开项目' },
  {
    key: 'project.canvas.node.edit',
    scope_kind: 'project',
    grp: 'project.canvas',
    label_zh: '编辑画布节点',
  },
  { key: 'project.task.view', scope_kind: 'project', grp: 'project.task', label_zh: '查看任务' },
  {
    key: 'project.task.run',
    scope_kind: 'project',
    grp: 'project.task',
    label_zh: '运行/重试任务',
  },
  { key: 'project.asset.view', scope_kind: 'project', grp: 'project.asset', label_zh: '查看资产' },
  {
    key: 'project.asset.create',
    scope_kind: 'project',
    grp: 'project.asset',
    label_zh: '上传/入库资产',
  },
  {
    key: 'project.asset.delete',
    scope_kind: 'project',
    grp: 'project.asset',
    label_zh: '删除资产',
    has_condition: true,
  },
  {
    key: 'project.library.view',
    scope_kind: 'project',
    grp: 'project.library',
    label_zh: '查看资源库',
  },
  {
    key: 'project.library.create',
    scope_kind: 'project',
    grp: 'project.library',
    label_zh: '创建/编辑资源库条目',
  },
  {
    key: 'project.library.delete',
    scope_kind: 'project',
    grp: 'project.library',
    label_zh: '删除资源库条目',
    has_condition: true,
  },
  {
    key: 'project.member.manage',
    scope_kind: 'project',
    grp: 'project.member',
    label_zh: '管理项目成员',
  },
  {
    key: 'project.settings.manage',
    scope_kind: 'project',
    grp: 'project.settings',
    label_zh: '项目设置/归档',
    has_condition: true,
  },
];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export interface RoleDef {
  key: string;
  name_zh: string;
  scope_kind: Scope;
  is_locked?: boolean;
  /** Capability keys, or 'ALL' for the super admin (also short-circuited in code). */
  permissions: string[] | 'ALL';
}

const PROJECT_WRITE = [
  'project.read',
  'project.canvas.node.edit',
  'project.task.view',
  'project.task.run',
  'project.asset.view',
  'project.asset.create',
  'project.asset.delete',
  'project.library.view',
  'project.library.create',
  'project.library.delete',
];

export const BUILTIN_ROLES: RoleDef[] = [
  {
    key: 'it_super_admin',
    name_zh: 'IT 超级管理员',
    scope_kind: 'system',
    is_locked: true,
    permissions: 'ALL',
  },
  {
    key: 'sys_admin',
    name_zh: '系统管理员',
    scope_kind: 'system',
    permissions: [
      'system.user.manage',
      'system.role.manage',
      'system.credential.manage',
      'system.model.manage',
      'system.billing.view',
      'system.billing.manage',
      'system.request_log.view',
      'system.request_log.manage',
      'system.config.sync', // embedded Model Catalog reload is a sys-admin operation
      'system.config.manage', // feature model config (AI analysis, agent, etc.)
      'system.content.manage', // publish/manage workspace-visible content
      'project.read', // cross-project read for support (system binding => all projects)
    ],
  },
  {
    key: 'project_admin',
    name_zh: '项目管理员',
    scope_kind: 'project',
    permissions: [...PROJECT_WRITE, 'project.member.manage', 'project.settings.manage'],
  },
  { key: 'project_member', name_zh: '项目成员', scope_kind: 'project', permissions: PROJECT_WRITE },
  {
    key: 'project_guest',
    name_zh: '游客',
    scope_kind: 'project',
    permissions: [
      'project.read',
      'project.task.view',
      'project.asset.view',
      'project.library.view',
    ],
  },
];

export const SYSTEM_ROLE_KEYS = ['it_super_admin', 'sys_admin'] as const;
export const SUPER_ADMIN = 'it_super_admin';

/** Resolve a role's concrete capability keys (expands 'ALL'). */
export function roleKeys(role: RoleDef): string[] {
  return role.permissions === 'ALL' ? ALL_PERMISSION_KEYS : role.permissions;
}
