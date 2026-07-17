import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';

import { RequirePerm } from '../authz/require-perm.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { WorkspaceService } from '../workspace/workspace.service';
import { StatsService } from './stats.service';

@RequirePerm('system.billing.view', { scope: 'system' })
@Controller('stats')
export class StatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly workspaces: WorkspaceService,
  ) {}

  @Get('overview')
  async overview(
    @CurrentUser() user: AuthUser,
    @Query('workspace_id') workspaceId?: string,
  ) {
    return this.stats.overview(await this.requireWorkspaceScope(user, workspaceId));
  }

  @Get('by-project')
  async byProject(
    @CurrentUser() user: AuthUser,
    @Query('workspace_id') workspaceId?: string,
  ) {
    return this.stats.byProject(await this.requireWorkspaceScope(user, workspaceId));
  }

  @Get('by-model')
  async byModel(
    @CurrentUser() user: AuthUser,
    @Query('workspace_id') workspaceId?: string,
  ) {
    return this.stats.byModel(await this.requireWorkspaceScope(user, workspaceId));
  }

  @Get('by-member')
  async byMember(
    @CurrentUser() user: AuthUser,
    @Query('workspace_id') workspaceId?: string,
  ) {
    return this.stats.byMember(await this.requireWorkspaceScope(user, workspaceId));
  }

  private async requireWorkspaceScope(user: AuthUser, requested?: string): Promise<string> {
    if (requested && requested !== user.workspace_id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'workspace scope does not match the authenticated session',
      });
    }
    await this.workspaces.assertMember(user.user_id, user.workspace_id);
    return user.workspace_id;
  }
}
