-- ============================================================
-- canvas schema · 007 — drop the vestigial per-session role
-- Authorization is fully owned by the RBAC role_bindings (005). The
-- workspace-level admin/member role that auth_sessions.role snapshotted
-- (003) no longer gates anything after the AdminGuard → PermissionGuard
-- migration, so drop it before stale role data accumulates.
-- ============================================================
BEGIN;

ALTER TABLE canvas.auth_sessions DROP COLUMN IF EXISTS role;

COMMIT;
