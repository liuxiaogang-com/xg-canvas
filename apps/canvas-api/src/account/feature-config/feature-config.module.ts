import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CredentialModule } from '../credential/credential.module';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import { FeatureModelConfig } from './feature-config.entity';
import { FeatureConfigService } from './feature-config.service';
import { FeatureConfigController } from './feature-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureModelConfig, ModelDefinition]), CredentialModule],
  controllers: [FeatureConfigController],
  providers: [FeatureConfigService],
  exports: [FeatureConfigService],
})
export class FeatureConfigModule {}
