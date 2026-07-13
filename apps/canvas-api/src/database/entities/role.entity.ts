import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** canvas.roles — a named bundle of capabilities. Built-in (is_system) seeded
 *  from code; custom roles (workspace_id set) are DB data, never overwritten. */
@Entity({ name: 'roles' })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  name_zh: string;

  @Column({ type: 'varchar', length: 10 })
  scope_kind: 'system' | 'project';

  @Column({ type: 'boolean', default: false })
  is_system: boolean;

  @Column({ type: 'boolean', default: false })
  is_locked: boolean;

  @Column({ type: 'uuid', nullable: true })
  workspace_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
