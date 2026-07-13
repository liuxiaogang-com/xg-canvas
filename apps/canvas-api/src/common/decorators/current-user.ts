import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface AuthUser {
  user_id: string;
  workspace_id: string;
  email: string;
  /** Opaque session id (auth_sessions.id) — empty only for legacy-JWT grace requests. */
  session_id: string;
}

export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used without SessionGuard');
  return req.user;
});
