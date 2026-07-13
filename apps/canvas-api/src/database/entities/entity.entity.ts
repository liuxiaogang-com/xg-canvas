import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'canvas', name: 'entities' })
@Index(['project_id', 'type'])
export class CanvasEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  project_id: string;

  @Column({ type: 'varchar', length: 20 })
  type: 'character' | 'scene' | 'prop' | 'storyboard';

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid', array: true, default: '{}' })
  ref_asset_ids: string[];

  @Column({ type: 'uuid', nullable: true })
  generated_asset_id: string | null;

  /** Optional link to a reusable library entry (e.g. character library). */
  @Column({ type: 'uuid', nullable: true })
  library_entry_id: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
