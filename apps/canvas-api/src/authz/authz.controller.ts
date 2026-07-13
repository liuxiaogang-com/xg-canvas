import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { ProjectService } from '../project/project.service';
import { AuthzService } from './authz.service';

/** Effective capabilities for the current user — drives frontend can(). */
@ApiTags('authz')
@Controller()
export class AuthzController {
  constructor(
    private readonly authz: AuthzService,
    private readonly projects: ProjectService,
  ) {}

  @Get('me/permissions')
  async mine(@CurrentUser() user: AuthUser): Promise<{ caps: string[]; is_super: boolean }> {
    const isSuper = await this.authz.isSuperOrOwner(user.user_id);
    const caps = await this.authz.resolveCapabilities(user.user_id, 'system', null);
    return { caps: [...caps], is_super: isSuper };
  }

  @Get('projects/:projectId/permissions')
  async project(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<{ caps: string[] }> {
    // Tenant isolation: a non-super user may only probe projects in a workspace
    // they belong to (getOrThrow 404s otherwise — no cross-workspace leak).
    if (!(await this.authz.isSuperOrOwner(user.user_id))) {
      await this.projects.getOrThrow(user.user_id, projectId);
    }
    const caps = await this.authz.resolveCapabilities(user.user_id, 'project', projectId);
    return { caps: [...caps] };
  }

  /** Assignable roles (for member/role dropdowns). */
  @Get('authz/roles')
  roles() {
    return this.authz.listRoles();
  }
}
