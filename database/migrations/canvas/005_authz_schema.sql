-- ============================================================
-- canvas schema · 005 — RBAC (two-tier scoped permission-based)
-- permissions(capability 目录) + roles(权限包) + role_permissions +
-- role_bindings(user × role × scope: system | project). Component-level:
-- a capability key (e.g. project.canvas.node.edit) is the same string in the
-- DB, the backend @RequirePerm, and the frontend can(). Catalog + built-in
-- roles are seeded from code on boot (AuthzBootstrapService); custom roles are
-- DB data. See docs/authz-spec.md.
-- ============================================================
BEGIN;

-- Atomic permission points (唯一事实来源;行内容由代码 seed,企业只读不可改 key).
CREATE TABLE canvas.permissions (
  key           VARCHAR(80) PRIMARY KEY,
  scope_kind    VARCHAR(10) NOT NULL CHECK (scope_kind IN ('system','project')),
  grp           VARCHAR(40) NOT NULL,
  label_zh      VARCHAR(120) NOT NULL,
  description   TEXT,
  has_condition BOOLEAN NOT NULL DEFAULT FALSE,   -- after allow, still owner/status/field二判
  is_dangerous  BOOLEAN NOT NULL DEFAULT FALSE,   -- 提权护栏:自定义角色不可随意勾
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A role = a named bundle of capabilities.
CREATE TABLE canvas.roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          VARCHAR(60) NOT NULL UNIQUE,        -- built-in: it_super_admin... custom: custom:<slug>
  name_zh      VARCHAR(120) NOT NULL,
  scope_kind   VARCHAR(10) NOT NULL CHECK (scope_kind IN ('system','project')),
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,     -- built-in: undeletable, key immutable
  is_locked    BOOLEAN NOT NULL DEFAULT FALSE,     -- it_super_admin: capability set is the full set
  workspace_id UUID NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE, -- NULL=global built-in
  created_by   UUID NULL REFERENCES canvas.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE canvas.role_permissions (
  role_id        UUID NOT NULL REFERENCES canvas.roles(id) ON DELETE CASCADE,
  permission_key VARCHAR(80) NOT NULL REFERENCES canvas.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

-- (user, role, scope) — replaces env ADMIN_EMAILS + the dead workspace_members.role.
CREATE TABLE canvas.role_bindings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES canvas.users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES canvas.roles(id) ON DELETE CASCADE,
  scope_kind  VARCHAR(10) NOT NULL CHECK (scope_kind IN ('system','project')),
  scope_id    UUID NULL,                           -- project_id for project scope; NULL for system
  granted_by  UUID NULL REFERENCES canvas.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scope_shape CHECK (
    (scope_kind = 'system'  AND scope_id IS NULL) OR
    (scope_kind = 'project' AND scope_id IS NOT NULL)
  ),
  UNIQUE (user_id, role_id, scope_kind, scope_id)
);
CREATE INDEX ix_role_bindings_user  ON canvas.role_bindings (user_id, scope_kind, scope_id);
CREATE INDEX ix_role_bindings_scope ON canvas.role_bindings (scope_kind, scope_id);

-- Break-glass instance owner (at most one; transferable). Always all-powerful.
ALTER TABLE canvas.users ADD COLUMN is_instance_owner BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX ux_users_single_instance_owner ON canvas.users ((1)) WHERE is_instance_owner;

-- Authorization audit (denies + sensitive allows + grant/revoke).
CREATE TABLE canvas.authz_audit (
  id             BIGSERIAL PRIMARY KEY,
  actor_id       UUID NULL REFERENCES canvas.users(id),
  action         VARCHAR(48) NOT NULL,             -- binding.grant | binding.revoke | deny | ...
  scope_kind     VARCHAR(10) NULL,
  scope_id       UUID NULL,
  target_type    VARCHAR(32) NULL,
  target_id      TEXT NULL,
  permission_key VARCHAR(80) NULL,
  decision       VARCHAR(8) NULL CHECK (decision IN ('allow','deny')),
  before         JSONB NULL,
  after          JSONB NULL,
  request_id     VARCHAR(64) NULL,
  ip             INET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_authz_audit_scope ON canvas.authz_audit (scope_id, created_at);
CREATE INDEX ix_authz_audit_actor ON canvas.authz_audit (actor_id, created_at);

COMMIT;
