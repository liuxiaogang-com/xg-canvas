import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthzModule } from '../../authz/authz.module';
import { ChannelInstallation } from '../channel/channel-installation.entity';
import { ModelSettings } from '../model-definition/model-settings.entity';
import { ProviderInstallation } from '../provider/provider-installation.entity';
import { CATALOG_ENTITIES } from './catalog.entities';
import { CatalogImportService } from './catalog-import.service';
import { CatalogLocalService } from './catalog-local.service';
import { CatalogLocalWriterService } from './catalog-local-writer.service';
import { CatalogReadService } from './catalog-read.service';
import { OutboundRouteSecurityService } from './outbound-route-security.service';

@Module({
  imports: [
    AuthzModule,
    TypeOrmModule.forFeature([
      ...CATALOG_ENTITIES,
      ProviderInstallation,
      ChannelInstallation,
      ModelSettings,
    ]),
  ],
  providers: [
    CatalogImportService,
    CatalogLocalService,
    CatalogLocalWriterService,
    CatalogReadService,
    OutboundRouteSecurityService,
  ],
  exports: [
    CatalogImportService,
    CatalogLocalService,
    CatalogLocalWriterService,
    CatalogReadService,
    OutboundRouteSecurityService,
    TypeOrmModule,
  ],
})
export class CatalogModule {}
