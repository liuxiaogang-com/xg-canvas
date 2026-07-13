import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AssetType, AssetVisibility } from '@xgcanvas/shared-types';

import { bigintNumberTransformer } from '../bigint-number.transformer';

export type AssetUploadDraftStatus = 'pending' | 'completed' | 'expired';

@Entity({ schema: 'canvas', name: 'asset_upload_drafts' })
@Index('idx_asset_upload_drafts_expiry', ['status', 'expires_at'], { where: "status = 'pending'" })
@Index('idx_asset_upload_drafts_owner', ['owner_id', 'created_at'])
export class AssetUploadDraft {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  workspace_id: string;

  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;

  @Column({ type: 'varchar', length: 20 })
  visibility: AssetVisibility;

  @Column({ type: 'varchar', length: 20 })
  type: AssetType;

  @Column({ type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ type: 'bigint', transformer: bigintNumberTransformer })
  bytes: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  @Column({ type: 'text', unique: true })
  storage_key: string;

  @Column({ type: 'text', nullable: true, unique: true })
  thumb_storage_key: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: AssetUploadDraftStatus;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  staging_cleaned_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
