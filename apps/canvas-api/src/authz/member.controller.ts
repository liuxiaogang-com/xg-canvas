import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { IdentityService } from '../identity/identity.service';
import { normalizeEmail } from '../identity/normalize';
import { RequirePerm } from './require-perm.decorator';
import { RoleBindingService } from './role-binding.service';
import { AddMemberDto, ChangeRoleDto } from './dto/member.dto';

const PROJECT = { scope: 'project', from: 'param', key: 'projectId' } as const;

/** Project member management — the project-admin surface. */
@ApiTags('members')
@Controller('projects/:projectId/members')
export class MemberController {
  constructor(
    private readonly roleBindings: RoleBindingService,
    private readonly identity: IdentityService,
  ) {}

  @Get()
  @RequirePerm('project.read', PROJECT)
  list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.roleBindings.listProjectMembers(projectId, user.user_id);
  }

  @Post()
  @RequirePerm('project.member.manage', PROJECT)
  @HttpCode(204)
  async add(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: AddMemberDto,
  ): Promise<void> {
    const targetId = await this.identity.findUserByIdentity('email', normalizeEmail(dto.email));
    if (!targetId) throw new NotFoundException({ code: 'NOT_FOUND', message: '该邮箱用户不存在' });
    await this.roleBindings.assignProjectRole(projectId, targetId, dto.role, user.user_id);
  }

  @Patch(':userId')
  @RequirePerm('project.member.manage', PROJECT)
  @HttpCode(204)
  async changeRole(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<void> {
    // A manager must not re-assign their own role (would let them undo a demotion).
    if (userId === user.user_id) {
      throw new BadRequestException({ code: 'SELF_ROLE_CHANGE_DENIED', message: '不能修改自己的角色' });
    }
    await this.roleBindings.assignProjectRole(projectId, userId, dto.role, user.user_id);
  }

  @Delete(':userId')
  @RequirePerm('project.member.manage', PROJECT)
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.roleBindings.removeProjectMember(projectId, userId, user.user_id);
  }
}
