import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  MAX_MODEL_ID_LENGTH,
  type ChannelRouteSnapshot,
  type TaskStatus,
  type TaskType,
} from '@xgcanvas/shared-types';

@Entity({ schema: 'canvas', name: 'tasks' })
@Index('idx_tasks_owner_status', ['owner_id', 'status', 'created_at'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60 })
  type: TaskType;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: TaskStatus;

  @Column({ type: 'varchar', length: MAX_MODEL_ID_LENGTH })
  model_id: string;

  @Column({ type: 'uuid' })
  model_resource_uid: string;

  @Column({ type: 'uuid' })
  model_revision_id: string;

  @Column({ type: 'uuid', nullable: true })
  rate_card_revision_id: string | null;

  @Column({ type: 'bigint' })
  catalog_epoch: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  external_task_id: string | null;

  /** Correlates an async task with its pending ops.request_logs row. */
  @Column({ type: 'uuid', nullable: true })
  invoke_request_id: string | null;

  /** Stable group prepared before the first outbound adapter attempt. */
  @Column({ type: 'uuid', nullable: true })
  invoke_logical_request_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  invoke_prepared_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  channel_resource_uid: string | null;

  @Column({ type: 'uuid', nullable: true })
  channel_revision_id: string | null;

  /** Frozen non-secret endpoint/options used by poll and cancel. */
  @Column({ type: 'jsonb', nullable: true })
  channel_route: ChannelRouteSnapshot | null;

  @Column({ type: 'uuid', nullable: true })
  credential_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  source_node_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;

  @Column({ type: 'uuid' })
  workspace_id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  params: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  inputs: Record<string, unknown>;

  @Column({ type: 'uuid', array: true, default: '{}' })
  output_asset_ids: string[];

  @Column({ type: 'text', nullable: true })
  text_output: string | null;

  @Column({ type: 'jsonb', nullable: true })
  json_output: unknown;

  @Column({ type: 'real', nullable: true })
  progress: number | null;

  @Column({ type: 'jsonb', nullable: true })
  error: { code: string; message: string; vendor?: unknown } | null;

  @Column({ type: 'int', default: 0 })
  retry_count: number;

  /** Vendor invocation attempt number; distinct from retry policy count. */
  @Column({ type: 'int', default: 0 })
  attempt_no: number;

  /** Internal worker lease. select:false prevents API list/detail exposure. */
  @Column({ type: 'uuid', nullable: true, select: false })
  lease_token: string | null;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  lease_expires_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  next_poll_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finished_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
