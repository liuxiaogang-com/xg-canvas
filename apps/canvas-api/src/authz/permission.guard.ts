import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AuthUser } from '../common/decorators/current-user';
import { AuthzService } from './authz.service';
import { REQUIRE_PERM, type RequirePermMeta } from './require-perm.decorator';

/**
 * Global guard (runs after SessionGuard). Routes without @RequirePerm pass
 * through. For a project-scoped check it resolves the project id from the route
 * and denies if absent (no silent fallthrough). Denials are audited.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<RequirePermMeta>(REQUIRE_PERM, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser; id?: string }>();
    const user = req.user;
    if (!user) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'no session' });

    let scopeId: string | null = null;
    if (meta.scope === 'project') {
      scopeId = resolveProjectId(req, meta);
      if (!scopeId) {
        // optional: route also serves null-project resources gated elsewhere.
        if (meta.optional) return true;
        throw new ForbiddenException({ code: 'FORBIDDEN', message: '缺少项目上下文' });
      }
    }

    const ok = await this.authz.can(user.user_id, meta.permission, meta.scope, scopeId);
    if (!ok) {
      void this.authz.audit({
        actor_id: user.user_id,
        action: 'deny',
        scope_kind: meta.scope,
        scope_id: scopeId,
        permission_key: meta.permission,
        decision: 'deny',
        request_id: req.id ?? null,
        ip: (req.ip as string) ?? null,
      });
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '权限不足', permission: meta.permission });
    }
    return true;
  }
}

function resolveProjectId(req: Request, meta: RequirePermMeta): string | null {
  const from = meta.from ?? 'param';
  const key = meta.key ?? (from === 'param' ? 'projectId' : 'project_id');
  const bag = (
    from === 'param' ? req.params : from === 'body' ? req.body : req.query
  ) as Record<string, unknown> | undefined;
  const v = bag?.[key];
  // 'global' is a reserved sentinel for workspace-level (null-project) listing.
  if (v === 'global') return null;
  return typeof v === 'string' && v ? v : null;
}
