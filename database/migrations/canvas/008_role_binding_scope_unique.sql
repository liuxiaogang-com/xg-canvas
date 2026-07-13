DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM canvas.role_bindings
    GROUP BY user_id, scope_kind, scope_id
    HAVING count(DISTINCT role_id) > 1
  ) THEN
    RAISE EXCEPTION
      'role binding migration stopped: one user has multiple roles in the same scope';
  END IF;
END $$;

DELETE FROM canvas.role_bindings a
USING canvas.role_bindings b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.role_id = b.role_id
  AND a.scope_kind = b.scope_kind
  AND a.scope_id IS NOT DISTINCT FROM b.scope_id;

CREATE UNIQUE INDEX ux_role_bindings_system_user
  ON canvas.role_bindings (user_id)
  WHERE scope_kind = 'system' AND scope_id IS NULL;

CREATE UNIQUE INDEX ux_role_bindings_project_user
  ON canvas.role_bindings (user_id, scope_id)
  WHERE scope_kind = 'project' AND scope_id IS NOT NULL;
