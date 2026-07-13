import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type SessionStatus = 'active' | 'revoked' | 'expired';

/** canvas.auth_sessions — one row per login state. `id` IS the opaque token's
 *  sid; `token_hash` = sha256(token). Truth for "立即踢 / 设备列表 / role 实时". */
@Entity({ name: 'auth_sessions' })
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  device_id: string;

  @Column({ type: 'uuid' })
  workspace_id: string;

  /** Which identity this session was minted from (004). */
  @Column({ type: 'uuid', nullable: true })
  identity_id: string | null;

  @Column({ type: 'bytea' })
  token_hash: Buffer;

  @Column({ type: 'bytea', nullable: true })
  prev_token_hash: Buffer | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: SessionStatus;

  // Snapshot at issue so the session is self-contained for AuthUser.
  // Authorization is owned by RBAC role_bindings, not the session.
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  revoked_reason: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  created_via: string | null;

  @Column({ type: 'boolean', default: false })
  remember: boolean;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  last_seen_at: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  issued_at: Date;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
