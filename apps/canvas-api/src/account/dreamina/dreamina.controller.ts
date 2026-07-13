import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DreaminaService } from './dreamina.service';
import { RequirePerm } from '../../authz/require-perm.decorator';

/** 即梦 login/account admin surface (merged into the 凭证 flow). OAuth Device
 *  Flow: POST /login hands back a verification_uri; the UI opens it and polls
 *  GET /login/status?device_code=... until success. */
@ApiTags('Dreamina')
@RequirePerm('system.credential.manage', { scope: 'system' })
@Controller('admin/dreamina')
export class DreaminaController {
  constructor(private readonly dreamina: DreaminaService) {}

  @Get('status')
  getStatus() {
    return this.dreamina.getStatus();
  }

  @Post('login')
  login() {
    return this.dreamina.startLogin();
  }

  @Get('login/status')
  loginStatus(@Query('device_code') deviceCode: string) {
    return this.dreamina.pollLogin(deviceCode);
  }

  @Post('logout')
  logout() {
    return this.dreamina.logout();
  }
}
