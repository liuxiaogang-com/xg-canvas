import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { buildLoginContext } from '../auth/login-context';
import { setSessionCookie } from '../auth/session-cookie';
import { CompleteSetupDto } from './setup.dto';
import { AllowDuringSetup } from './allow-during-setup.decorator';
import { SetupService } from './setup.service';

@Public()
@AllowDuringSetup()
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status() {
    return this.setup.status();
  }

  @Post('complete')
  @HttpCode(201)
  async complete(
    @Body() dto: CompleteSetupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // JSON forces a browser preflight for cross-origin calls. Sec-Fetch-Site is a
    // second guard for browsers on the same registrable domain or a bad CORS config.
    if (!req.is('application/json')) {
      throw new UnsupportedMediaTypeException({
        code: 'SETUP_JSON_REQUIRED',
        message: '初始化请求必须使用 application/json',
      });
    }
    if (req.get('sec-fetch-site') === 'cross-site') {
      throw new ForbiddenException({
        code: 'SETUP_CROSS_SITE_FORBIDDEN',
        message: '不允许从跨站页面初始化实例',
      });
    }
    const result = await this.setup.complete(dto, buildLoginContext(req));
    setSessionCookie(req, res, result.token);
    return result;
  }
}
