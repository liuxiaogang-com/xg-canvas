import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** canvas.permissions — the capability catalog (seeded from code on boot). */
@Entity({ name: 'permissions' })
export class Permission {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'varchar', length: 10 })
  scope_kind: 'system' | 'project';

  @Column({ type: 'varchar', length: 40 })
  grp: string;

  @Column({ type: 'varchar', length: 120 })
  label_zh: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: false })
  has_condition: boolean;

  @Column({ type: 'boolean', default: false })
  is_dangerous: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
