import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthDevice, AuthSession } from '../database/entities';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/** Opaque server-side sessions: liveness, device cap, instant revoke ("踢设备").
 *  RedisModule is @Global, so it needs no explicit import. */
@Module({
  imports: [TypeOrmModule.forFeature([AuthSession, AuthDevice])],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
