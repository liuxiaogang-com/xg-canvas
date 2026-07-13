import { Global, Module } from '@nestjs/common';

import { DreaminaModule } from '../dreamina/dreamina.module';
import { StorageModule } from '../storage/storage.module';
import { AdapterRegistry } from './registry';

@Global()
@Module({
  imports: [DreaminaModule, StorageModule],
  providers: [AdapterRegistry],
  exports: [AdapterRegistry],
})
export class AdaptersModule {}
