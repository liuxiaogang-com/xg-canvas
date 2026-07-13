import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ModelProvider } from '../provider/provider.entity';
import { ModelCredential } from '../credential/credential.entity';

@Entity({ schema: 'account', name: 'channels' })
@Unique(['provider_id', 'slug'])
export class ModelChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  provider_id: string;

  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ type: 'varchar', length: 200 })
  display_name: string;

  @Column({ type: 'varchar', length: 20 })
  invocation_method: string;

  @Column({ type: 'text', nullable: true })
  base_url: string;

  @Column({ type: 'jsonb', default: {} })
  request_config: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'round_robin' })
  load_balance_strategy: string;

  @Column({ type: 'int', default: 100 })
  weight: number;

  @Column({ type: 'int', nullable: true })
  rate_limit_rpm: number;

  @Column({ type: 'int', nullable: true })
  rate_limit_tpm: number;

  @Column({ type: 'int', nullable: true })
  daily_quota: number;

  @Column({ type: 'int', default: 10 })
  concurrent_limit: number;

  @Column({ type: 'int', default: 0 })
  current_daily_usage: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_usage_reset_at: Date;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  health_status: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_health_check_at: Date;

  @Column({ type: 'int', default: 0 })
  consecutive_failures: number;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => ModelProvider, (provider) => provider.channels, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider: ModelProvider;

  @OneToMany(() => ModelCredential, (cred) => cred.channel)
  credentials: ModelCredential[];
}
