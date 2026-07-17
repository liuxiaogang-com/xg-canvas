import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ModelCredential } from '../credential/credential.entity';

@Entity({ schema: 'account', name: 'channel_installations' })
export class ChannelInstallation {
  @PrimaryColumn('uuid')
  channel_resource_uid: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'jsonb', default: {} })
  config_overrides: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => ModelCredential, (credential) => credential.channel)
  credentials: ModelCredential[];
}
