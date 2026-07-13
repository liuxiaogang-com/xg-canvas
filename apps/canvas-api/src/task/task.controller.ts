import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { RequirePerm } from '../authz/require-perm.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { CreateTaskDto } from './dto/task.dto';
import type { TaskStatus } from './state-machine';
import { TaskService } from './task.service';

// project_id is optional here — null-project (gen.text) tasks fall back to
// owner_id + workspace membership in the service.
const VIEW = { scope: 'project', from: 'query', key: 'project_id', optional: true } as const;

@Controller('tasks')
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Post()
  @RequirePerm('project.task.run', { scope: 'project', from: 'body', key: 'project_id', optional: true })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.user_id, user.workspace_id, dto);
  }

  @Get()
  @RequirePerm('project.task.view', VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Query('project_id') projectId?: string,
    @Query('status') status?: TaskStatus,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('standalone') standalone?: string,
    @Query('active') active?: string,
  ) {
    const standaloneOnly = parseBooleanQuery(standalone);
    const activeOnly = parseBooleanQuery(active);
    if (projectId && standaloneOnly) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'project_id cannot be combined with standalone=true' });
    }
    if (status && activeOnly) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'status cannot be combined with active=true' });
    }
    return this.tasks.list(user.user_id, {
      workspace_id: user.workspace_id,
      project_id: projectId,
      status,
      limit: limit ? Number(limit) : undefined,
      before,
      standalone: standaloneOnly,
      active: activeOnly,
    });
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.getOrThrow(user.user_id, id, user.workspace_id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.cancel(user.user_id, id);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.retry(user.user_id, user.workspace_id, id);
  }
}

function parseBooleanQuery(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === 'true' || value === '1';
}
