import { Controller, Get, Query } from '@nestjs/common';

import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview(@Query('workspace_id') workspaceId?: string) {
    return this.stats.overview(workspaceId || undefined);
  }

  @Get('by-project')
  byProject(@Query('workspace_id') workspaceId?: string) {
    return this.stats.byProject(workspaceId || undefined);
  }

  @Get('by-model')
  byModel(@Query('workspace_id') workspaceId?: string) {
    return this.stats.byModel(workspaceId || undefined);
  }

  @Get('by-member')
  byMember(@Query('workspace_id') workspaceId?: string) {
    return this.stats.byMember(workspaceId || undefined);
  }
}
