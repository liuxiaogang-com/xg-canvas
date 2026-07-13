import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { TaskStatus, TaskType } from '@xgcanvas/shared-types';

@Entity({ schema: 'canvas', name: 'tasks' })
@Index('idx_tasks_owner_status', ['owner_id', 'status', 'created_at'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60 })
  type: TaskType;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: TaskStatus | 'pending';

  @Column({ type: 'varchar', length: 100 })
  model_id: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  external_task_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  channel_id: string | null;

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
