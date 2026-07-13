import { Module } from '@nestjs/common';

import { FeatureConfigModule } from '../account/feature-config/feature-config.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [FeatureConfigModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
