import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdaptersModule } from '../adapters/adapters.module';
import { CatalogModule } from '../catalog/catalog.module';
import { RedisModule } from '../redis';
import { RegistryBootstrapService } from './registry-bootstrap.service';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';
import { RegistrySnapshotFactory } from './registry-snapshot.factory';

@Global()
@Module({
  imports: [ConfigModule, AdaptersModule, CatalogModule, RedisModule],
  providers: [RegistryService, RegistrySnapshotFactory, RegistryBootstrapService],
  controllers: [RegistryController],
  exports: [RegistryService, RegistryBootstrapService],
})
export class RegistryModule {}
