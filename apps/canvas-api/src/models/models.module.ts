import { Module } from '@nestjs/common';

import { CredentialModule } from '../account/credential/credential.module';
import { ModelsController } from './models.controller';
import { DemoModelRegistry } from './demo-model-registry';

@Module({
  imports: [CredentialModule],
  controllers: [ModelsController],
  providers: [DemoModelRegistry],
})
export class ModelsModule {}
