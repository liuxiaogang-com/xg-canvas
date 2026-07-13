import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountInvokeClient } from './invoke.client';
import { AccountModelsClient } from './models.client';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AccountInvokeClient, AccountModelsClient],
  exports: [AccountInvokeClient, AccountModelsClient],
})
export class AccountClientModule {}
