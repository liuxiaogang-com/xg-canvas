import {
  Check,
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
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
  description: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @OneToMany(() => FeatureModelBinding, (binding) => binding.feature_config)
  bindings: FeatureModelBinding[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

@Entity({ schema: 'account', name: 'feature_model_bindings' })
@Unique(['feature_config_id', 'priority'])
@Index('idx_feature_bindings_model', ['model_resource_uid'])
@Check('CHK_feature_model_bindings_priority', 'priority >= 0')
export class FeatureModelBinding {
  @PrimaryColumn('uuid')
  feature_config_id: string;

  @PrimaryColumn('uuid')
  model_resource_uid: string;

  @Column('int')
  priority: number;

  @ManyToOne(() => FeatureModelConfig, (config) => config.bindings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_config_id' })
  feature_config: FeatureModelConfig;
}
