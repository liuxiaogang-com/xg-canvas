import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ModelProvider } from '../provider/provider.entity';
import type { ModelParamSchema, ParamConstraint } from '@xgcanvas/constraint-engine';
import type { ModelInputContract } from '@xgcanvas/shared-types';

@Entity({ schema: 'account', name: 'model_definitions' })
export class ModelDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  provider_id: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  model_id: string;

  @Column({ type: 'varchar', length: 200 })
  provider_model_id: string;

  @Column({ type: 'varchar', length: 200 })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  icon_url: string;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'text', array: true })
  task_types: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  capabilities: string[];

  @Column({ type: 'varchar', length: 20, default: 'sync' })
  invocation_mode: string;

  @Column({ type: 'boolean', default: false })
  supports_streaming: boolean;

  /** Routing key into the in-process Adapter registry. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  adapter_key: string | null;

  @Column({ type: 'uuid', array: true, default: '{}' })
  allowed_channel_ids: string[];

  /** 参数 Schema — 驱动前端自动渲染参数面板 */
  @Column({ type: 'jsonb', default: {} })
  param_schema: ModelParamSchema;

  /** 参数约束规则 — 处理参数间联动关系 */
  @Column({ type: 'jsonb', default: [] })
  param_constraints: ParamConstraint[];

  /** Canonical generation input contract: supported modes and reference slots. */
  @Column({ type: 'jsonb', default: {} })
  input_contract: ModelInputContract;

  /** Async polling parameters when invocation_mode='async'. */
  @Column({ type: 'jsonb', default: {} })
  poll_policy: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  limits: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  pricing: Record<string, any>;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'varchar', length: 20, default: 'public' })
  visibility: string;

  @Column({ type: 'int', nullable: true })
  daily_quota: number | null;

  @Column({ type: 'boolean', default: false })
  deprecated: boolean;

  @Column({ type: 'text', nullable: true })
  deprecated_message: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  source_version: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => ModelProvider, (provider) => provider.models, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider: ModelProvider;
}
