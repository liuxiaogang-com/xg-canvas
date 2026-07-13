import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { SessionService, type SessionDeviceView } from './session.service';

/** Personal-center device management. Protected by the global SessionGuard. */
@ApiTags('sessions')
@Controller('me/sessions')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<SessionDeviceView[]> {
    return this.sessions.list(user.user_id, user.session_id);
  }

  /** Kick a device. Can only revoke your own sessions; takes effect next request. */
  @Post(':id/revoke')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.sessions.revoke(id, user.user_id, 'kicked');
  }
}
