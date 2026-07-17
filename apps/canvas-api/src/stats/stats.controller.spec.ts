import {
  ForbiddenException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SessionGuard } from '../auth/session.guard';
import { PermissionGuard } from '../authz/permission.guard';
import type { AuthUser } from '../common/decorators/current-user';
import { StatsController } from './stats.controller';

const USER: AuthUser = {
  user_id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  email: 'member@example.com',
  session_id: '33333333-3333-4333-8333-333333333333',
};

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => StatsController.prototype.overview,
    getClass: () => StatsController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('StatsController authorization', () => {
  it('rejects anonymous requests through the global session boundary', async () => {
    const sessions = { validate: jest.fn() };
    const guard = new SessionGuard(new Reflector(), sessions as never);

    await expect(guard.canActivate(context({ headers: {}, cookies: {} })))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.validate).not.toHaveBeenCalled();
  });

  it('rejects an authenticated ordinary user without system.billing.view', async () => {
    const authz = {
      can: jest.fn().mockResolvedValue(false),
      audit: jest.fn().mockResolvedValue(undefined),
    };
    const guard = new PermissionGuard(new Reflector(), authz as never);

    await expect(guard.canActivate(context({ user: USER, headers: {}, ip: '127.0.0.1' })))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(authz.can).toHaveBeenCalledWith(
      USER.user_id,
      'system.billing.view',
      'system',
      null,
    );
  });

  it('rejects a workspace_id outside the authenticated session scope', async () => {
    const stats = { overview: jest.fn() };
    const workspaces = { assertMember: jest.fn() };
    const controller = new StatsController(stats as never, workspaces as never);

    await expect(controller.overview(USER, '44444444-4444-4444-8444-444444444444'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(workspaces.assertMember).not.toHaveBeenCalled();
    expect(stats.overview).not.toHaveBeenCalled();
  });

  it.each([
    ['overview', 'overview'],
    ['byProject', 'byProject'],
    ['byModel', 'byModel'],
    ['byMember', 'byMember'],
  ] as const)('%s rechecks membership and reads only the session workspace', async (method, serviceMethod) => {
    const stats = {
      overview: jest.fn().mockResolvedValue({}),
      byProject: jest.fn().mockResolvedValue([]),
      byModel: jest.fn().mockResolvedValue([]),
      byMember: jest.fn().mockResolvedValue([]),
    };
    const workspaces = { assertMember: jest.fn().mockResolvedValue({}) };
    const controller = new StatsController(stats as never, workspaces as never);

    await controller[method](USER, USER.workspace_id);

    expect(workspaces.assertMember).toHaveBeenCalledWith(USER.user_id, USER.workspace_id);
    expect(stats[serviceMethod]).toHaveBeenCalledWith(USER.workspace_id);
  });
});
