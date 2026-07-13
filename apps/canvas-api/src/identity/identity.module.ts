import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthIdentity, User, VerificationChallenge, Workspace, WorkspaceMember } from '../database/entities';
import { PasswordService } from '../auth/password.service';
import { SessionModule } from '../session/session.module';
import { AuthConfigService } from './auth-config.service';
import { EmailSenderService } from './email-sender.service';
import { IdentityService } from './identity.service';
import { MeIdentityController } from './me-identity.controller';
import { MergeController } from './merge.controller';
import { MergeService } from './merge.service';
import { ProviderRegistry } from './providers/provider-registry';
import { VerificationService } from './verification.service';

/** Multi-identity account core: the find-or-create funnel + password/email/dev
 *  helpers, verification codes/magic-links, login-method config, and the
 *  account merge / re-bind state machine. */
@Module({
  imports: [
    SessionModule,
    TypeOrmModule.forFeature([AuthIdentity, User, Workspace, WorkspaceMember, VerificationChallenge]),
  ],
  controllers: [MeIdentityController, MergeController],
  providers: [
    IdentityService,
    EmailSenderService,
    PasswordService,
    VerificationService,
    AuthConfigService,
    ProviderRegistry,
    MergeService,
  ],
  exports: [IdentityService, VerificationService, AuthConfigService, ProviderRegistry],
})
export class IdentityModule {}
