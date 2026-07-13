import { Controller, Get, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

import { ConflictException } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { IdentityService } from '../identity/identity.service';
import { ProviderRegistry } from '../identity/providers/provider-registry';
import { Keys } from '../redis/keys';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';
import { buildLoginContext } from './login-context';
import { clearOAuthState, oauthCallbackUri, readOAuthState, setOAuthState } from './oauth-state';
import { setSessionCookie } from './session-cookie';

/** Redirect OAuth login (wechat_oa / wechat_open / feishu / mock). Bind reuses
 *  the same callback via an authenticated start endpoint (see me-identity). */
@ApiTags('auth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly identity: IdentityService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get(':key/start')
  start(
    @Param('key') key: string,
    @Query('hint') hint: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const provider = this.registry.get(key);
    if (!provider) throw new NotFoundException({ code: 'NOT_FOUND', message: `unknown provider ${key}` });
    const state = randomBytes(16).toString('hex');
    setOAuthState(req, res, { state, key, mode: 'login' });
    res.redirect(provider.authorizeUrl({ state, redirectUri: oauthCallbackUri(this.config, key), hint }));
  }

  @Public()
  @Get(':key/callback')
  async callback(
    @Param('key') key: string,
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const st = readOAuthState(req);
    clearOAuthState(req, res);
    const provider = this.registry.get(key);
    if (!provider || !st || st.key !== key || !query.state || st.state !== query.state) {
      res.redirect('/auth?oauth=invalid');
      return;
    }
    let resolved;
    try {
      resolved = await provider.resolve({ query, redirectUri: oauthCallbackUri(this.config, key) });
    } catch {
      res.redirect('/auth?oauth=error');
      return;
    }
    // Bind flow: attach this identity to the already-logged-in user.
    if (st.mode === 'bind' && st.userId) {
      try {
        await this.identity.bindResolved(st.userId, resolved);
        res.redirect('/account/logins?bind=ok');
      } catch (e) {
        if (e instanceof ConflictException) {
          // Already on another account. Stash the proven identity so the user can
          // force-bind/merge from the personal center (OAuth already proved control).
          await this.redis.set(
            Keys.oauthPending(st.userId),
            JSON.stringify({ provider: resolved.provider, providerUid: resolved.providerUid }),
            600,
          );
          res.redirect('/account/logins?bind=conflict');
        } else {
          res.redirect('/account/logins?bind=error');
        }
      }
      return;
    }
    // Login flow: find-or-create + issue a session.
    const userId = await this.identity.findOrCreate(resolved);
    const result = await this.auth.issueForUserId(userId, buildLoginContext(req), key);
    setSessionCookie(req, res, result.token);
    res.redirect('/');
  }
}
