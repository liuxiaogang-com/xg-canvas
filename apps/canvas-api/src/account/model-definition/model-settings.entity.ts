import type { CatalogVisibility } from '@xgcanvas/shared-types';
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'account', name: 'model_settings' })
export class ModelSettings {
  @PrimaryColumn('uuid')
  model_resource_uid: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 20, default: 'public' })
  visibility: CatalogVisibility;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
