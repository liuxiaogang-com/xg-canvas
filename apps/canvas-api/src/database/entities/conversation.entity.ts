import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MAX_MODEL_ID_LENGTH } from '@xgcanvas/shared-types';

/** canvas.conversations — a chat thread (the 对话 lane). */
@Entity({ name: 'conversations' })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspace_id: string;

  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;

  @Index()
  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 200, default: '新对话' })
  title: string;

  @Column({ type: 'varchar', length: MAX_MODEL_ID_LENGTH, nullable: true })
  model_id: string | null;

  @Column({ type: 'text', nullable: true })
  system_prompt: string | null;

  @Column({ type: 'jsonb', default: {} })
  params: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
