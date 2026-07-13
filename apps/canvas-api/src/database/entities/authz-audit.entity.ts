import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** canvas.authz_audit — every deny + sensitive allow + grant/revoke. */
@Entity({ name: 'authz_audit' })
export class AuthzAudit {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @Column({ type: 'varchar', length: 48 })
  action: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  scope_kind: string | null;

  @Column({ type: 'uuid', nullable: true })
  scope_id: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  target_type: string | null;

  @Column({ type: 'text', nullable: true })
  target_id: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  permission_key: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  decision: 'allow' | 'deny' | null;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  request_id: string | null;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
