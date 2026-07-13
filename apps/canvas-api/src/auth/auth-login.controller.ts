import { Body, Controller, Get, HttpCode, NotFoundException, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { AuthConfigService } from '../identity/auth-config.service';
import { IdentityService } from '../identity/identity.service';
import { normalizeEmail, normalizePhone } from '../identity/normalize';
import { ProviderRegistry } from '../identity/providers/provider-registry';
import { VerificationService } from '../identity/verification.service';
import { AuthService, type AuthResult } from './auth.service';
import { buildLoginContext } from './login-context';
import { setSessionCookie } from './session-cookie';
import { EmailCodeDto, EmailLoginDto, MagicDto, PhoneCodeDto, PhoneLoginDto } from './dto/code-login.dto';

/** Passwordless login surface: email/phone codes + magic-link, plus /auth/config. */
@ApiTags('auth')
@Controller('auth')
export class AuthLoginController {
  constructor(
    private readonly verification: VerificationService,
    private readonly identity: IdentityService,
    private readonly auth: AuthService,
    private readonly authConfig: AuthConfigService,
    private readonly registry: ProviderRegistry,
  ) {}

  @Public()
  @Get('config')
  config() {
    return { ...this.authConfig.snapshot(), oauth: this.registry.keys() };
  }

  @Public()
  @Post('email/code')
  @HttpCode(200)
  sendEmailCode(@Body() dto: EmailCodeDto) {
    this.requireMethod('email_code');
    return this.verification.sendCode('email', dto.email, 'login');
  }

  @Public()
  @Post('email/login')
  @HttpCode(200)
  async emailLogin(
    @Body() dto: EmailLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    this.requireMethod('email_code');
    const r = await this.verification.verifyCode('email', dto.email, 'login', dto.code);
    if (!r.ok) throw new UnauthorizedException({ code: 'INVALID_CODE', message: '验证码无效或已过期' });
    const userId = await this.identity.findOrCreate({
      provider: 'email',
      providerUid: normalizeEmail(dto.email),
      displayName: localPart(dto.email),
    });
    return this.finish(userId, req, res, 'email');
  }

  @Public()
  @Post('phone/code')
  @HttpCode(200)
  sendPhoneCode(@Body() dto: PhoneCodeDto) {
    this.requireMethod('phone_code');
    return this.verification.sendCode('phone', dto.phone, 'login');
  }

  @Public()
  @Post('phone/login')
  @HttpCode(200)
  async phoneLogin(
    @Body() dto: PhoneLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    this.requireMethod('phone_code');
    const r = await this.verification.verifyCode('phone', dto.phone, 'login', dto.code);
    if (!r.ok) throw new UnauthorizedException({ code: 'INVALID_CODE', message: '验证码无效或已过期' });
    const phone = normalizePhone(dto.phone);
    const userId = await this.identity.findOrCreate({
      provider: 'phone',
      providerUid: phone,
      displayName: maskPhone(phone),
    });
    return this.finish(userId, req, res, 'phone');
  }

  @Public()
  @Post('email/magic')
  @HttpCode(200)
  sendMagic(@Body() dto: MagicDto) {
    this.requireMethod('email_code');
    return this.verification.createMagicLink(dto.email, 'login');
  }

  /** Magic-link landing: consume token, set the session cookie, bounce into the app. */
  @Public()
  @Get('magic')
  async magic(@Query('token') token: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    this.requireMethod('email_code');
    const c = token ? await this.verification.consumeMagic(token) : null;
    if (!c) {
      res.redirect('/auth?magic=invalid');
      return;
    }
    const userId = await this.identity.findOrCreate({
      provider: 'email',
      providerUid: c.target,
      displayName: localPart(c.target),
    });
    const result = await this.auth.issueForUserId(userId, buildLoginContext(req), 'email');
    setSessionCookie(req, res, result.token);
    res.redirect('/');
  }

  private async finish(
    userId: string,
    req: Request,
    res: Response,
    via: string,
  ): Promise<AuthResult> {
    const result = await this.auth.issueForUserId(userId, buildLoginContext(req), via);
    setSessionCookie(req, res, result.token);
    return result;
  }

  private requireMethod(method: string): void {
    if (!this.authConfig.methods().includes(method)) throw new NotFoundException();
  }
}

function localPart(email: string): string {
  return email.split('@')[0] || '用户';
}

function maskPhone(phone: string): string {
  return phone.length >= 4 ? `用户${phone.slice(-4)}` : '用户';
}
