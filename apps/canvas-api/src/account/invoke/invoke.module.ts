import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ModelChannel } from '../channel/channel.entity';
import { ModelCredential } from '../credential/credential.entity';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import { CredentialModule } from '../credential/credential.module';
import { CancelService } from './cancel.service';
import { ChannelResolverService } from './channel-resolver.service';
import { CredentialResolverService } from './credential-resolver.service';
import { InvokeService } from './invoke.service';
import { PollService } from './poll.service';

// @Global so the account-client seam (canvas-api/src/account-client) can inject
// these in-process instead of HTTP-calling account-api (M6 P2).
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ModelDefinition, ModelChannel, ModelCredential]), CredentialModule],
  providers: [
    InvokeService,
    PollService,
    CancelService,
    ChannelResolverService,
    CredentialResolverService,
  ],
  exports: [InvokeService, PollService, CancelService],
})
export class InvokeModule {}
