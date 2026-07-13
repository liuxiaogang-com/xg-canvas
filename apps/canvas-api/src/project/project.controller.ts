import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { RequirePerm } from '../authz/require-perm.decorator';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectService } from './project.service';

const BY_ID = { scope: 'project', from: 'param', key: 'id' } as const;

@Controller('projects')
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('workspace_id') workspaceId?: string) {
    return this.projects.list(user.user_id, workspaceId ?? user.workspace_id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.user_id, dto);
  }

  @Get(':id')
  @RequirePerm('project.read', BY_ID)
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.getOrThrow(user.user_id, id);
  }

  @Patch(':id')
  @RequirePerm('project.settings.manage', BY_ID)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user.user_id, id, dto);
  }

  @Delete(':id')
  @RequirePerm('project.settings.manage', BY_ID)
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.projects.remove(user.user_id, id);
  }
}
