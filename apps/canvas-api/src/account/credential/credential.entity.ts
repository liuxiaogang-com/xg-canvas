import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChannelInstallation } from '../channel/channel-installation.entity';

@Entity({ schema: 'account', name: 'credentials' })
export class ModelCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  channel_resource_uid: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 30 })
  credential_type: 'api_key' | 'cli_session';

  @Column({ type: 'bytea' })
  encrypted_payload: Buffer;

  @Column({ type: 'varchar', length: 100 })
  encryption_key_id: string;

  @Column({ type: 'text', array: true, default: '{}' })
  payload_fields: string[];

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** Archived credentials are hidden from admin/new routing but retained for in-flight Tasks. */
  @Column({ type: 'timestamptz', nullable: true })
  archived_at: Date | null;

  @Column({ type: 'boolean', default: true })
  is_valid: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  last_validated_at: Date | null;

  @Column({ type: 'text', nullable: true })
  validation_error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expires_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at: Date | null;

  @Column({ type: 'bigint', default: 0 })
  total_usage_count: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => ChannelInstallation, (channel) => channel.credentials, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channel_resource_uid' })
  channel: ChannelInstallation;
}
