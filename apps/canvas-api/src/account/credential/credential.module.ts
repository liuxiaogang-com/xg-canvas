import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelChannel } from '../channel/channel.entity';
import { ModelProvider } from '../provider/provider.entity';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import { DreaminaModule } from '../dreamina/dreamina.module';
import { ModelCredential } from './credential.entity';
import { CredentialService } from './credential.service';
import { CredentialController } from './credential.controller';
import { EncryptionService } from './encryption.service';
import { EncryptionKeyringStore } from './encryption-keyring.store';
import { ProviderModelsService } from './provider-models.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModelCredential, ModelChannel, ModelProvider, ModelDefinition]), DreaminaModule],
  controllers: [CredentialController],
  providers: [CredentialService, EncryptionKeyringStore, EncryptionService, ProviderModelsService],
  exports: [CredentialService, EncryptionService],
})
export class CredentialModule {}
