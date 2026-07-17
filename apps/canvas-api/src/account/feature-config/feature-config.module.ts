import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeatureModelBinding, FeatureModelConfig } from './feature-config.entity';
import { FeatureConfigService } from './feature-config.service';
import { FeatureConfigController } from './feature-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureModelConfig, FeatureModelBinding])],
  controllers: [FeatureConfigController],
  providers: [FeatureConfigService],
  exports: [FeatureConfigService],
})
export class FeatureConfigModule {}
