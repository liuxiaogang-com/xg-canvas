import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AuthzService } from './authz.service';
import { BUILTIN_ROLES, PERMISSIONS, roleKeys } from './catalog';

/**
 * Seeds the capability catalog + built-in roles from code on every boot
 * (idempotent upsert; built-in role_permissions are refreshed). On first ever
 * run refreshes the built-in permission and role catalog. Instance-owner
 * creation is handled exclusively by the one-time SetupService flow.
 */
@Injectable()
export class AuthzBootstrapService implements OnModuleInit {
  private readonly logger = new Logger('AuthzBootstrap');

  constructor(
    private readonly ds: DataSource,
    private readonly authz: AuthzService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedPermissions();
    await this.seedBuiltinRoles();
  }

  private async seedPermissions(): Promise<void> {
    for (const p of PERMISSIONS) {
      await this.ds.query(
        `INSERT INTO canvas.permissions (key, scope_kind, grp, label_zh, has_condition, is_dangerous)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (key) DO UPDATE SET
           scope_kind=$2, grp=$3, label_zh=$4, has_condition=$5, is_dangerous=$6`,
        [p.key, p.scope_kind, p.grp, p.label_zh, !!p.has_condition, !!p.is_dangerous],
      );
    }
  }

  private async seedBuiltinRoles(): Promise<void> {
    for (const role of BUILTIN_ROLES) {
      const r = await this.ds.query(
        `INSERT INTO canvas.roles (key, name_zh, scope_kind, is_system, is_locked)
         VALUES ($1,$2,$3,true,$4)
         ON CONFLICT (key) DO UPDATE SET name_zh=$2, scope_kind=$3, is_system=true, is_locked=$4
         RETURNING id`,
        [role.key, role.name_zh, role.scope_kind, !!role.is_locked],
      );
      const roleId = r[0].id as string;
      // Refresh the built-in role's capability set to match the catalog.
      await this.ds.query(`DELETE FROM canvas.role_permissions WHERE role_id = $1`, [roleId]);
      for (const key of roleKeys(role)) {
        await this.ds.query(
          `INSERT INTO canvas.role_permissions (role_id, permission_key) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [roleId, key],
        );
      }
      // A tightened built-in role must not linger in caches after a restart.
      await this.authz.invalidateByRoleId(roleId);
    }
    this.logger.log(`authz seeded: ${PERMISSIONS.length} permissions, ${BUILTIN_ROLES.length} built-in roles`);
  }

}
