import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { AssetScope, AssetType, AssetVisibility } from '@xgcanvas/shared-types';

import { bigintNumberTransformer } from '../bigint-number.transformer';

@Entity({ schema: 'canvas', name: 'assets' })
@Index(['project_id', 'created_at'])
@Index(['workspace_id', 'created_at'])
@Index('uk_assets_upload_draft_id', ['upload_draft_id'], { unique: true, where: 'upload_draft_id IS NOT NULL' })
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: AssetType;

  @Column({ type: 'varchar', length: 20, default: 'project' })
  scope: AssetScope;

  @Column({ type: 'varchar', length: 20, default: 'project' })
  visibility: AssetVisibility;

  @Column({ type: 'uuid' })
  workspace_id: string;

  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid', nullable: true })
  task_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  upload_draft_id: string | null;

  @Column({ type: 'text' })
  storage_key: string;

  @Column({ type: 'varchar', length: 100, default: 'xgcanvas-assets' })
  bucket: string;

  @Column({ type: 'text', nullable: true })
  origin_url: string | null;

  @Column({ type: 'text', nullable: true })
  thumb_storage_key: string | null;

  @Column({ type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ type: 'bigint', transformer: bigintNumberTransformer })
  bytes: number;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'int', nullable: true })
  duration_ms: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum_sha256: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'varchar', length: 50, nullable: true })
  role: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
