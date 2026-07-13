import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelProvider } from '../provider/provider.entity';
import { ModelChannel } from '../channel/channel.entity';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import { ConfigSyncService } from './config-sync.service';
import { ConfigSyncController } from './config-sync.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ModelProvider, ModelChannel, ModelDefinition]),
  ],
  controllers: [ConfigSyncController],
  providers: [ConfigSyncService],
  exports: [ConfigSyncService],
})
export class ConfigSyncModule {}
