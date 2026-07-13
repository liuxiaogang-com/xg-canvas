import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** canvas.auth_identities — one row per login method bound to a user. The unique
 *  (provider, provider_uid) keeps an external identity attached to at most one
 *  person; union_key merges a WeChat unionid's many openids into one user. */
@Entity({ name: 'auth_identities' })
export class AuthIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Column({ type: 'varchar', length: 191 })
  provider_uid: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  union_key: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  app_id: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  openid: string | null;

  /** phone/email proven; NULL = not yet a usable login identity. */
  @Column({ type: 'timestamptz', nullable: true })
  verified_at: Date | null;

  /** argon2id, only for provider='password'. */
  @Column({ type: 'text', nullable: true })
  secret_hash: string | null;

  @Column({ type: 'jsonb', default: {} })
  raw_profile: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  last_authenticated_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
