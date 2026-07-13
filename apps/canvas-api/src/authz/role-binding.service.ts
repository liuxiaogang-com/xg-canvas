import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Role } from '../database/entities';
import { AuthzService } from './authz.service';
import { SUPER_ADMIN } from './catalog';

export interface MemberView {
  user_id: string;
  display_name: string;
  role_key: string;
  role_name: string;
  is_self: boolean;
}

/** Manages role_bindings (project members + system roles) and keeps the authz
 *  cache + the workspace tenant-gate in sync. */
@Injectable()
export class RoleBindingService {
  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    private readonly authz: AuthzService,
    private readonly ds: DataSource,
  ) {}

  async listProjectMembers(projectId: string, selfId: string): Promise<MemberView[]> {
    const rows = await this.ds.query(
      `SELECT b.user_id, u.display_name, r.key AS role_key, r.name_zh AS role_name
         FROM canvas.role_bindings b
         JOIN canvas.roles r ON r.id = b.role_id
         JOIN canvas.users u ON u.id = b.user_id
        WHERE b.scope_kind = 'project' AND b.scope_id = $1
        ORDER BY u.display_name`,
      [projectId],
    );
    return rows.map((r: any) => ({
      user_id: r.user_id,
      display_name: r.display_name,
      role_key: r.role_key,
      role_name: r.role_name,
      is_self: r.user_id === selfId,
    }));
  }

  /** Assign a project role to a user. Ensures the workspace tenant-membership
   *  exists (the existence gate) and that the user holds exactly one project role. */
  async assignProjectRole(
    projectId: string,
    targetUserId: string,
    roleKey: string,
    grantedBy: string,
  ): Promise<void> {
    const role = await this.roles.findOne({ where: { key: roleKey } });
    if (!role || role.scope_kind !== 'project') {
      throw new BadRequestException({ code: 'BAD_ROLE', message: '不是有效的项目角色' });
    }
    const proj = await this.ds.query(`SELECT workspace_id FROM canvas.projects WHERE id = $1`, [projectId]);
    if (!proj.length) throw new NotFoundException({ code: 'NOT_FOUND', message: '项目不存在' });
    const workspaceId = proj[0].workspace_id as string;

    await this.ds.transaction(async (em) => {
      // Tenant gate: ensure workspace membership exists.
      await em.query(
        `INSERT INTO canvas.workspace_members (workspace_id, user_id, role)
         VALUES ($1,$2,'member') ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [workspaceId, targetUserId],
      );
      // One project role per member: drop existing project bindings on this project.
      await em.query(
        `DELETE FROM canvas.role_bindings WHERE user_id=$1 AND scope_kind='project' AND scope_id=$2`,
        [targetUserId, projectId],
      );
      await em.query(
        `INSERT INTO canvas.role_bindings (user_id, role_id, scope_kind, scope_id, granted_by)
         VALUES ($1,$2,'project',$3,$4)`,
        [targetUserId, role.id, projectId, grantedBy],
      );
    });
    await this.authz.invalidate(targetUserId);
    await this.authz.audit({
      actor_id: grantedBy,
      action: 'binding.grant',
      scope_kind: 'project',
      scope_id: projectId,
      target_type: 'user',
      target_id: targetUserId,
      after: { role: roleKey },
    });
  }

  async removeProjectMember(projectId: string, targetUserId: string, by: string): Promise<void> {
    await this.ds.query(
      `DELETE FROM canvas.role_bindings WHERE user_id=$1 AND scope_kind='project' AND scope_id=$2`,
      [targetUserId, projectId],
    );
    await this.authz.invalidate(targetUserId);
    await this.authz.audit({
      actor_id: by,
      action: 'binding.revoke',
      scope_kind: 'project',
      scope_id: projectId,
      target_type: 'user',
      target_id: targetUserId,
    });
  }

  /** Grant/replace a system role (sys_admin / it_super_admin). The last-super-admin
   *  guard runs inside the tx with row locks, so concurrent demotions can't both
   *  pass and zero out the super admins. */
  async setSystemRole(targetUserId: string, roleKey: string | null, by: string): Promise<void> {
    if (roleKey && !['sys_admin', SUPER_ADMIN].includes(roleKey)) {
      throw new BadRequestException({ code: 'BAD_ROLE', message: '不是有效的系统角色' });
    }
    await this.ds.transaction(async (em) => {
      // Lock this user's super binding (if any) to serialize concurrent changes.
      const wasSuper =
        (
          await em.query(
            `SELECT b.id FROM canvas.role_bindings b JOIN canvas.roles r ON r.id=b.role_id
             WHERE b.user_id=$1 AND b.scope_kind='system' AND r.key=$2 FOR UPDATE`,
            [targetUserId, SUPER_ADMIN],
          )
        ).length > 0;
      if (wasSuper && roleKey !== SUPER_ADMIN) {
        // Lock the OTHER active super admins; if none remain, refuse.
        const others = await em.query(
          `SELECT b.user_id FROM canvas.role_bindings b
             JOIN canvas.roles r ON r.id=b.role_id
             JOIN canvas.users u ON u.id=b.user_id
            WHERE b.scope_kind='system' AND r.key=$1 AND u.status='active' AND b.user_id <> $2
            FOR UPDATE OF b`,
          [SUPER_ADMIN, targetUserId],
        );
        if (others.length < 1) {
          throw new BadRequestException({ code: 'LAST_SUPER_ADMIN', message: '不能移除最后一个超级管理员' });
        }
      }
      await em.query(`DELETE FROM canvas.role_bindings WHERE user_id=$1 AND scope_kind='system'`, [targetUserId]);
      if (roleKey) {
        const role = await em.query(`SELECT id FROM canvas.roles WHERE key=$1`, [roleKey]);
        await em.query(
          `INSERT INTO canvas.role_bindings (user_id, role_id, scope_kind, scope_id, granted_by)
           VALUES ($1,$2,'system',NULL,$3) ON CONFLICT DO NOTHING`,
          [targetUserId, role[0].id, by],
        );
      }
    });
    await this.authz.invalidate(targetUserId);
    await this.authz.audit({
      actor_id: by,
      action: roleKey ? 'binding.grant' : 'binding.revoke',
      scope_kind: 'system',
      target_type: 'user',
      target_id: targetUserId,
      after: roleKey ? { role: roleKey } : null,
    });
  }
}
