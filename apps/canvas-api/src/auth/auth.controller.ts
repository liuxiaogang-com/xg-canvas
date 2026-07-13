import { Body, Controller, Get, HttpCode, NotFoundException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { Public } from '../common/decorators/public.decorator';
import { SessionService } from '../session/session.service';
import { AuthConfigService } from '../identity/auth-config.service';
import { AuthService, type AuthResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { extractToken } from './extractors';
import { buildLoginContext } from './login-context';
import { clearSessionCookie, setSessionCookie } from './session-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly authConfig: AuthConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    if (!this.authConfig.methods().includes('password')) throw new NotFoundException();
    const r = await this.auth.register(dto, buildLoginContext(req));
    setSessionCookie(req, res, r.token);
    return r;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    if (!this.authConfig.methods().includes('password')) throw new NotFoundException();
    const r = await this.auth.login(dto, buildLoginContext(req));
    setSessionCookie(req, res, r.token);
    return r;
  }

  @Public()
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    if (!this.authConfig.mockEnabled) throw new NotFoundException();
    const r = await this.auth.devLogin(buildLoginContext(req));
    setSessionCookie(req, res, r.token);
    return r;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = extractToken(req);
    if (token) await this.sessions.revokeByToken(token, 'logout');
    clearSessionCookie(req, res);
  }

  /** Sliding renewal. Public because a 401'd session can't pass the guard, and
   *  this endpoint validates the token itself. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ refreshed: boolean }> {
    const token = extractToken(req);
    if (!token || !(await this.sessions.refresh(token))) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'session expired' });
    }
    setSessionCookie(req, res, token);
    return { refreshed: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
