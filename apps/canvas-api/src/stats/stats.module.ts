import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Task } from '../database/entities';
import { WorkspaceModule } from '../workspace/workspace.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([Task]), WorkspaceModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
