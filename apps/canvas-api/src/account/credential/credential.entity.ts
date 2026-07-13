import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ModelChannel } from '../channel/channel.entity';

@Entity({ schema: 'account', name: 'credentials' })
export class ModelCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  channel_id: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string;

  @Column({ type: 'varchar', length: 30 })
  credential_type: string;

  @Column({ type: 'bytea' })
  encrypted_payload: Buffer;

  @Column({ type: 'varchar', length: 100 })
  encryption_key_id: string;

  @Column({ type: 'text', array: true, default: '{}' })
  payload_fields: string[];

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'boolean', default: true })
  is_valid: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  last_validated_at: Date;

  @Column({ type: 'text', nullable: true })
  validation_error: string;

  @Column({ type: 'timestamptz', nullable: true })
  expires_at: Date;

  @Column({ type: 'boolean', default: false })
  auto_refresh: boolean;

  @Column({ type: 'bytea', nullable: true })
  refresh_token_encrypted: Buffer;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at: Date;

  @Column({ type: 'bigint', default: 0 })
  total_usage_count: number;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => ModelChannel, (channel) => channel.credentials, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: ModelChannel;
}
