import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthzAudit, Role, User } from '../database/entities';
import { IdentityModule } from '../identity/identity.module';
import { ProjectModule } from '../project/project.module';
import { AuthzBootstrapService } from './authz-bootstrap.service';
import { AuthzController } from './authz.controller';
import { AuthzService } from './authz.service';
import { MemberController } from './member.controller';
import { PermissionGuard } from './permission.guard';
import { RoleBindingService } from './role-binding.service';
import { SystemAdminController } from './system-admin.controller';

/** RBAC: capability resolution + global PermissionGuard + role/member management
 *  + boot-time catalog/role seed and super-admin bootstrap. */
@Module({
  imports: [TypeOrmModule.forFeature([User, AuthzAudit, Role]), IdentityModule, ProjectModule],
  controllers: [AuthzController, MemberController, SystemAdminController],
  providers: [AuthzService, RoleBindingService, PermissionGuard, AuthzBootstrapService],
  exports: [AuthzService, PermissionGuard],
})
export class AuthzModule {}
