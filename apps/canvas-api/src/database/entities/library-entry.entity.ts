import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { AssetScope, AssetVisibility, LibraryMaterial, LibraryProviderRef } from '@xgcanvas/shared-types';

/** Unified reusable-resource library entry (character / voice / style ...).
 *  Dual binding: material (our bucket) + provider_refs (vendor-side), coexisting. */
@Entity({ schema: 'canvas', name: 'library_entries' })
@Index(['workspace_id', 'kind', 'created_at'])
export class LibraryEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  kind: string;

  @Column({ type: 'varchar', length: 20, default: 'workspace' })
  scope: AssetScope;

  @Column({ type: 'varchar', length: 20, default: 'workspace' })
  visibility: AssetVisibility;

  @Column({ type: 'uuid' })
  workspace_id: string;

  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'uuid', nullable: true })
  cover_asset_id: string | null;

  @Column({ type: 'jsonb', nullable: true })
  material: LibraryMaterial | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  provider_refs: LibraryProviderRef[];

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
