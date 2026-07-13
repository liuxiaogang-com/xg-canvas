import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'account', name: 'feature_model_configs' })
export class FeatureModelConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  feature_key: string;

  @Column({ type: 'varchar', length: 200 })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', array: true, default: '{}' })
  model_ids: string[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  primary_model_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  fallback_model_id: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
