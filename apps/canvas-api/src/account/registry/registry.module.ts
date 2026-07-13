import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdaptersModule } from '../adapters/adapters.module';
import { ConfigSyncModule } from '../config-sync/config-sync.module';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import { RedisModule } from '../redis';
import { RegistryBootstrapService } from './registry-bootstrap.service';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    AdaptersModule,
    ConfigSyncModule,
    RedisModule,
    TypeOrmModule.forFeature([ModelDefinition]),
  ],
  providers: [RegistryService, RegistryBootstrapService],
  controllers: [RegistryController],
  exports: [RegistryService, RegistryBootstrapService],
})
export class RegistryModule {}
