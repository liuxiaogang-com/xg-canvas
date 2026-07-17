import { Module } from '@nestjs/common';

import { AccountClientModule } from '../account-client';
import { StorageModule } from '../account/storage/storage.module';
import { InstanceReadinessController } from './instance-readiness.controller';
import { InstanceReadinessService } from './instance-readiness.service';

@Module({
  imports: [StorageModule, AccountClientModule],
  controllers: [InstanceReadinessController],
  providers: [InstanceReadinessService],
  exports: [InstanceReadinessService],
})
export class InstanceReadinessModule {}
