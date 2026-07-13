import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'canvas', name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Identity (email / password / feishu / wechat ...) lives in canvas.auth_identities (004).
  @Column({ type: 'varchar', length: 200 })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  avatar_url: string | null;

  @Column({ type: 'uuid', nullable: true })
  primary_identity_id: string | null;

  /** Merge tombstone: set when this account was absorbed into another (P2). */
  @Column({ type: 'uuid', nullable: true })
  merged_into_user_id: string | null;

  /** Break-glass: an instance owner is unconditionally all-powerful in authz. */
  @Column({ type: 'boolean', default: false })
  is_instance_owner: boolean;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'disabled';

  @Column({ type: 'timestamptz', nullable: true })
  last_login_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
