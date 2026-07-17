import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CredentialModule } from '../credential/credential.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ModelCredential } from '../credential/credential.entity';
import { CancelService } from './cancel.service';
import { ChannelResolverService } from './channel-resolver.service';
import { CredentialResolverService } from './credential-resolver.service';
import { InvokeService } from './invoke.service';
import { InvokeAttemptLogService } from './invoke-attempt-log.service';
import { ModelAvailabilityService } from './model-availability.service';
import { PollService } from './poll.service';

// @Global so the account-client seam (canvas-api/src/account-client) can inject
// these in-process instead of HTTP-calling account-api (M6 P2).
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ModelCredential]), CredentialModule, CatalogModule],
  providers: [
    InvokeService,
    InvokeAttemptLogService,
    PollService,
    CancelService,
    ChannelResolverService,
    CredentialResolverService,
    ModelAvailabilityService,
  ],
  exports: [
    InvokeService,
    PollService,
    CancelService,
    ChannelResolverService,
    CredentialResolverService,
    ModelAvailabilityService,
  ],
})
export class InvokeModule {}
