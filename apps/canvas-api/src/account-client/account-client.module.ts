import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FeatureConfigModule } from '../account/feature-config/feature-config.module';
import { ModelDefinitionModule } from '../account/model-definition/model-definition.module';

import { AccountInvokeClient } from './invoke.client';
import { AccountModelsClient } from './models.client';

@Global()
@Module({
  imports: [ConfigModule, FeatureConfigModule, ModelDefinitionModule],
  providers: [AccountInvokeClient, AccountModelsClient],
  exports: [AccountInvokeClient, AccountModelsClient],
})
export class AccountClientModule {}
