import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import { RequirePerm } from '../authz/require-perm.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { RequestLogService } from './request-log.service';
import { RequestLogAnalysisService } from './request-log-analysis.service';

@Controller('admin/request-logs')
@RequirePerm('system.request_log.view', { scope: 'system' })
export class RequestLogController {
  constructor(
    private readonly logs: RequestLogService,
    private readonly analysis: RequestLogAnalysisService,
  ) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('provider_slug') provider_slug?: string,
    @Query('model_id') model_id?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.logs.list({ status, source, provider_slug, model_id, before, limit: limit ? Number(limit) : undefined });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.logs.get(id);
  }

  /** AI analysis of ONE request log — diagnose this request via a text model. */
  @Post(':id/analyze')
  analyze(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.analysis.analyzeOne(id, user.user_id, user.workspace_id);
  }

  /** Retention cleanup. before_days deletes logs older than N days. Requires a filter. */
  @Post('purge')
  @RequirePerm('system.request_log.manage', { scope: 'system' })
  async purge(@Body() body: { before_days?: number; status?: string; provider_slug?: string }) {
    const before = body.before_days ? new Date(Date.now() - body.before_days * 86_400_000) : undefined;
    const deleted = await this.logs.purge({ before, status: body.status, provider_slug: body.provider_slug });
    return { deleted };
  }
}
