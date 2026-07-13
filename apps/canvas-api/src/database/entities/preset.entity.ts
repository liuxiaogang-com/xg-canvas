import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface PresetSegment {
  role: 'system' | 'user' | 'assistant';
  text: string;
}

@Entity({ schema: 'canvas', name: 'prompt_presets' })
export class PromptPreset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  scope: 'system' | 'user';

  @Column({ type: 'uuid', nullable: true })
  owner_id: string | null;

  @Column({ type: 'varchar', length: 60 })
  task_type: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'jsonb' })
  content: PresetSegment[];

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
