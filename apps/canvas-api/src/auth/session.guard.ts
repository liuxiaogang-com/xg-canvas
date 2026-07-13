import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/decorators/current-user';
import { SessionService } from '../session/session.service';
import { extractToken } from './extractors';

/**
 * Global guard. Validates an opaque server-side session every request (Redis
 * judge, DB fallback), so revocation is instant. NOT a passport strategy —
 * opaque tokens have no signature to verify.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'no session' });

    const cache = await this.sessions.validate(token);
    if (!cache) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'session expired' });
    req.user = {
      user_id: cache.user_id,
      workspace_id: cache.workspace_id,
      email: cache.email ?? '',
      session_id: cache.sid,
    };
    return true;
  }
}
