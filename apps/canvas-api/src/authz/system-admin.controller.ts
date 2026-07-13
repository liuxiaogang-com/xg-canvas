import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { AuthzService } from './authz.service';
import { SUPER_ADMIN } from './catalog';
import { RequirePerm } from './require-perm.decorator';
import { RoleBindingService } from './role-binding.service';
import { SetSystemRoleDto } from './dto/member.dto';

const SYSTEM = { scope: 'system' } as const;

/** System user/role management (sys_admin surface). */
@ApiTags('system-admin')
@Controller('admin/rbac')
export class SystemAdminController {
  constructor(
    private readonly roleBindings: RoleBindingService,
    private readonly authz: AuthzService,
    private readonly ds: DataSource,
  ) {}

  @Get('users')
  @RequirePerm('system.user.manage', SYSTEM)
  users() {
    return this.ds.query(
      `SELECT u.id, u.display_name, u.status, u.is_instance_owner,
              (SELECT r.key FROM canvas.role_bindings b JOIN canvas.roles r ON r.id=b.role_id
                WHERE b.user_id=u.id AND b.scope_kind='system' LIMIT 1) AS system_role,
              (SELECT provider_uid FROM canvas.auth_identities i
                WHERE i.user_id=u.id AND i.provider='email' LIMIT 1) AS email
         FROM canvas.users u
        WHERE u.merged_into_user_id IS NULL
        ORDER BY u.created_at`,
    );
  }

  @Put('users/:userId/system-role')
  @RequirePerm('system.user.manage', SYSTEM)
  @HttpCode(204)
  async setSystemRole(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: SetSystemRoleDto,
  ): Promise<void> {
    // Granting any system role is gated behind the dangerous capability — only a
    // super admin mints system roles (prevents sys_admin self-propagation).
    if (dto.role === SUPER_ADMIN || dto.role === 'sys_admin') {
      const ok = await this.authz.can(user.user_id, 'system.user.assign_super_admin', 'system', null);
      if (!ok) throw new ForbiddenException({ code: 'FORBIDDEN', message: '需要「指派超级管理员」权限' });
    }
    await this.roleBindings.setSystemRole(userId, dto.role ?? null, user.user_id);
  }
}
