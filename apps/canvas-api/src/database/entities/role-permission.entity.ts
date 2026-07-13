import { Entity, PrimaryColumn } from 'typeorm';

/** canvas.role_permissions — which capabilities a role bundles (the bundle's contents). */
@Entity({ name: 'role_permissions' })
export class RolePermission {
  @PrimaryColumn({ type: 'uuid' })
  role_id: string;

  @PrimaryColumn({ type: 'varchar', length: 80 })
  permission_key: string;
}
