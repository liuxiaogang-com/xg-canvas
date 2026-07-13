import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { PermissionGuard } from './permission.guard';
import type { RequirePermMeta } from './require-perm.decorator';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(meta: RequirePermMeta | undefined, canResult = true) {
  const reflector = { getAllAndOverride: () => meta } as never;
  const authz = { can: jest.fn().mockResolvedValue(canResult), audit: jest.fn().mockResolvedValue(undefined) };
  return { guard: new PermissionGuard(reflector, authz as never), authz };
}

describe('PermissionGuard', () => {
  it('passes routes without @RequirePerm', async () => {
    const { guard } = makeGuard(undefined);
    expect(await guard.canActivate(ctx({ user: { user_id: 'u' } }))).toBe(true);
  });

  it('denies when there is no session user', async () => {
    const { guard } = makeGuard({ permission: 'system.user.manage', scope: 'system' });
    await expect(guard.canActivate(ctx({}))).rejects.toThrow(ForbiddenException);
  });

  it('system scope checks with a null scopeId', async () => {
    const { guard, authz } = makeGuard({ permission: 'system.user.manage', scope: 'system' });
    await guard.canActivate(ctx({ user: { user_id: 'u' } }));
    expect(authz.can).toHaveBeenCalledWith('u', 'system.user.manage', 'system', null);
  });

  it('project scope resolves the id from a route param', async () => {
    const { guard, authz } = makeGuard({ permission: 'project.read', scope: 'project', from: 'param', key: 'projectId' });
    await guard.canActivate(ctx({ user: { user_id: 'u' }, params: { projectId: 'p1' } }));
    expect(authz.can).toHaveBeenCalledWith('u', 'project.read', 'project', 'p1');
  });

  it('missing project id + optional -> passes without a permission check', async () => {
    const { guard, authz } = makeGuard(
      { permission: 'project.asset.view', scope: 'project', from: 'query', key: 'project_id', optional: true },
      false,
    );
    expect(await guard.canActivate(ctx({ user: { user_id: 'u' }, query: {} }))).toBe(true);
    expect(authz.can).not.toHaveBeenCalled();
  });

  it('missing project id + not optional -> denies', async () => {
    const { guard } = makeGuard({ permission: 'project.read', scope: 'project', from: 'param', key: 'projectId' });
    await expect(guard.canActivate(ctx({ user: { user_id: 'u' }, params: {} }))).rejects.toThrow(ForbiddenException);
  });

  it("'global' sentinel is treated as null-project (optional pass)", async () => {
    const { guard, authz } = makeGuard(
      { permission: 'project.asset.view', scope: 'project', from: 'query', key: 'project_id', optional: true },
      false,
    );
    expect(await guard.canActivate(ctx({ user: { user_id: 'u' }, query: { project_id: 'global' } }))).toBe(true);
    expect(authz.can).not.toHaveBeenCalled();
  });

  it('a denied check audits and throws', async () => {
    const { guard, authz } = makeGuard(
      { permission: 'project.read', scope: 'project', from: 'param', key: 'projectId' },
      false,
    );
    await expect(guard.canActivate(ctx({ user: { user_id: 'u' }, params: { projectId: 'p' } }))).rejects.toThrow(
      ForbiddenException,
    );
    expect(authz.audit).toHaveBeenCalled();
  });
});
