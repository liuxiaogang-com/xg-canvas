import { Module } from '@nestjs/common';

import { ModelDefinitionModule } from '../account/model-definition/model-definition.module';
import { StorageModule } from '../account/storage/storage.module';
import { InstanceReadinessController } from './instance-readiness.controller';
import { InstanceReadinessService } from './instance-readiness.service';

@Module({
  imports: [StorageModule, ModelDefinitionModule],
  controllers: [InstanceReadinessController],
  providers: [InstanceReadinessService],
  exports: [InstanceReadinessService],
})
export class InstanceReadinessModule {}
