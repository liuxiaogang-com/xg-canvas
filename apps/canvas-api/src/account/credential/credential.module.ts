import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { DreaminaModule } from '../dreamina/dreamina.module';
import { ModelCredential } from './credential.entity';
import { CredentialService } from './credential.service';
import { CredentialCatalogService } from './credential-catalog.service';
import { CredentialController } from './credential.controller';
import { CredentialVendorStatusService } from './credential-vendor-status.service';
import { EncryptionModule } from './encryption.module';
import { ProviderModelsService } from './provider-models.service';
import { ProviderCatalogWritesService } from './provider-catalog-writes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ModelCredential]),
    CatalogModule,
    DreaminaModule,
    EncryptionModule,
  ],
  controllers: [CredentialController],
  providers: [
    CredentialService,
    CredentialVendorStatusService,
    CredentialCatalogService,
    ProviderCatalogWritesService,
    ProviderModelsService,
  ],
  exports: [CredentialService, EncryptionModule],
})
export class CredentialModule {}
