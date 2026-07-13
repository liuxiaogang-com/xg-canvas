import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ModelChannel } from '../channel/channel.entity';
import { ModelDefinition } from '../model-definition/model-definition.entity';

@Entity({ schema: 'account', name: 'providers' })
export class ModelProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 200 })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  icon_url: string;

  @Column({ type: 'text', nullable: true })
  homepage_url: string;

  @Column({ type: 'text', nullable: true })
  base_url: string;

  @Column({ type: 'varchar', length: 30, default: 'api_key' })
  auth_method: string;

  @Column({ type: 'jsonb', default: {} })
  auth_config: Record<string, any>;

  @Column({ type: 'varchar', length: 20, array: true, default: () => "ARRAY['http']::varchar[]" })
  invocation_methods: string[];

  @Column({ type: 'varchar', length: 50, array: true, default: '{}' })
  adapter_keys: string[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  sdk_package: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  documentation_url: string;

  @Column({ type: 'text', array: true, default: '{}' })
  supported_regions: string[];

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: string;

  @Column({ type: 'text', nullable: true })
  config_file_path: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @OneToMany(() => ModelChannel, (channel) => channel.provider)
  channels: ModelChannel[];

  @OneToMany(() => ModelDefinition, (model) => model.provider)
  models: ModelDefinition[];
}
