import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User, Workspace, WorkspaceMember } from '../database/entities';
import { IdentityModule } from '../identity/identity.module';
import { SessionModule } from '../session/session.module';
import { AuthController } from './auth.controller';
import { AuthLoginController } from './auth-login.controller';
import { AuthService } from './auth.service';
import { OAuthController } from './oauth.controller';
import { SessionGuard } from './session.guard';

@Module({
  imports: [
    SessionModule,
    IdentityModule,
    TypeOrmModule.forFeature([User, Workspace, WorkspaceMember]),
  ],
  controllers: [AuthController, AuthLoginController, OAuthController],
  providers: [AuthService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
