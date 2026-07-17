import { Module } from '@nestjs/common';

import { AdaptersModule } from './adapters/adapters.module';
import { ChannelModule } from './channel/channel.module';
import { CatalogModule } from './catalog/catalog.module';
import { CredentialModule } from './credential/credential.module';
import { DreaminaModule } from './dreamina/dreamina.module';
import { FeatureConfigModule } from './feature-config/feature-config.module';
import { InvokeModule } from './invoke/invoke.module';
import { ModelDefinitionModule } from './model-definition/model-definition.module';
import { ProviderModule } from './provider/provider.module';
import { RedisModule } from './redis';
import { RegistryModule } from './registry';
import { StorageModule } from './storage';

/**
 * Absorbed account-api: provider/channel/credential/model + adapters + registry
 * + invoke, mounted in-process inside canvas-api (M6 monolith merge).
 *
 * Redis is shared through the root RedisModule. Account storage remains the
 * adapter downloader port, backed by the same remote S3/R2 configuration.
 * Callers use the account-client seam instead of reaching into this subtree.
 */
@Module({
  imports: [
    RedisModule,
    CatalogModule,
    StorageModule,
    AdaptersModule,
    RegistryModule,
    ProviderModule,
    ChannelModule,
    CredentialModule,
    ModelDefinitionModule,
    DreaminaModule,
    FeatureConfigModule,
    InvokeModule,
  ],
})
export class AccountModule {}
