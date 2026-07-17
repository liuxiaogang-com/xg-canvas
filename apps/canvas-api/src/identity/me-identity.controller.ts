import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { oauthCallbackUri, setOAuthState } from '../auth/oauth-state';
import {
  EmailCodeDto,
  EmailLoginDto,
  PhoneCodeDto,
  PhoneLoginDto,
} from '../auth/dto/code-login.dto';
import { IdentityService } from './identity.service';
import { ProviderRegistry } from './providers/provider-registry';
import { VerificationService } from './verification.service';

/** Personal-center login-method management. Behind the global SessionGuard. */
@ApiTags('identities')
@Controller('me/identities')
export class MeIdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly verification: VerificationService,
    private readonly registry: ProviderRegistry,
    private readonly config: ConfigService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.identity.listForUser(user.user_id);
  }

  @Delete(':id')
  @HttpCode(204)
  async unbind(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.identity.unbind(user.user_id, id);
  }

  @Post('bind/email/code')
  @HttpCode(200)
  sendEmailBindCode(@CurrentUser() user: AuthUser, @Body() dto: EmailCodeDto) {
    return this.verification.sendCode('email', dto.email, 'bind', user.user_id);
  }

  @Post('bind/email')
  @HttpCode(201)
  async bindEmail(@CurrentUser() user: AuthUser, @Body() dto: EmailLoginDto): Promise<{ bound: true }> {
    const r = await this.verification.verifyCode('email', dto.email, 'bind', dto.code);
    if (!r.ok) throw new BadRequestException({ code: 'INVALID_CODE', message: '验证码无效或已过期' });
    await this.identity.bindVerifiedContact(user.user_id, 'email', dto.email);
    return { bound: true };
  }

  @Post('bind/phone/code')
  @HttpCode(200)
  sendPhoneBindCode(@CurrentUser() user: AuthUser, @Body() dto: PhoneCodeDto) {
    return this.verification.sendCode('phone', dto.phone, 'bind', user.user_id);
  }

  @Post('bind/phone')
  @HttpCode(201)
  async bindPhone(@CurrentUser() user: AuthUser, @Body() dto: PhoneLoginDto): Promise<{ bound: true }> {
    const r = await this.verification.verifyCode('phone', dto.phone, 'bind', dto.code);
    if (!r.ok) throw new BadRequestException({ code: 'INVALID_CODE', message: '验证码无效或已过期' });
    await this.identity.bindVerifiedContact(user.user_id, 'phone', dto.phone);
    return { bound: true };
  }

  /** Authenticated OAuth-bind start: stamp the current user into the state, then
   *  redirect to the provider; the shared callback finishes the bind. */
  @Get('oauth/:key/start')
  bindOauthStart(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const provider = this.registry.get(key);
    if (!provider) throw new NotFoundException({ code: 'NOT_FOUND', message: `unknown provider ${key}` });
    const state = randomBytes(16).toString('hex');
    setOAuthState(req, res, { state, key, mode: 'bind', userId: user.user_id });
    res.redirect(provider.authorizeUrl({ state, redirectUri: oauthCallbackUri(this.config, key) }));
  }
}
