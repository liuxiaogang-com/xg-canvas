import { ALL_PERMISSION_KEYS, BUILTIN_ROLES, PERMISSIONS, roleKeys, SUPER_ADMIN } from './catalog';

describe('authz catalog', () => {
  it('permission keys are unique', () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every built-in role references real capabilities', () => {
    for (const r of BUILTIN_ROLES) {
      if (r.permissions === 'ALL') continue;
      for (const k of r.permissions) expect(ALL_PERMISSION_KEYS).toContain(k);
    }
  });

  it('roleKeys expands ALL to the full catalog (super admin)', () => {
    const sup = BUILTIN_ROLES.find((r) => r.key === SUPER_ADMIN)!;
    expect(roleKeys(sup).slice().sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  it('sys_admin can reach the ops/log/model/credential caps (AdminGuard migration regression)', () => {
    const keys = roleKeys(BUILTIN_ROLES.find((r) => r.key === 'sys_admin')!);
    expect(keys).toEqual(
      expect.arrayContaining([
        'system.config.sync',
        'system.request_log.manage',
        'system.model.manage',
        'system.credential.manage',
        'system.billing.view',
        'system.content.manage',
      ]),
    );
    expect(keys).not.toContain('project.task.run');
    expect(keys).not.toContain('project.asset.create');
    expect(keys).not.toContain('project.library.create');
  });

  it('project roles grant only project caps (sys_admin cross-project read is system-bound, not here)', () => {
    for (const r of BUILTIN_ROLES.filter((x) => x.scope_kind === 'project')) {
      for (const k of roleKeys(r)) expect(k.startsWith('project.')).toBe(true);
    }
  });

  it('project_guest is read-only (no edit/run/manage caps)', () => {
    const keys = roleKeys(BUILTIN_ROLES.find((r) => r.key === 'project_guest')!);
    expect(keys).toContain('project.read');
    expect(keys).not.toContain('project.canvas.node.edit');
    expect(keys).not.toContain('project.task.run');
    expect(keys).not.toContain('project.member.manage');
  });
});
