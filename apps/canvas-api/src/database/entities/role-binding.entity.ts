import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** canvas.role_bindings — (user, role, scope). scope_id is the project_id for a
 *  project binding, NULL for a system binding (which applies to all projects). */
@Entity({ name: 'role_bindings' })
export class RoleBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  role_id: string;

  @Column({ type: 'varchar', length: 10 })
  scope_kind: 'system' | 'project';

  @Column({ type: 'uuid', nullable: true })
  scope_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  granted_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
