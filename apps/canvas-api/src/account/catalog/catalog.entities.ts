import type { CatalogBundleV1, CatalogResourceKind } from '@xgcanvas/model-catalog';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'account', name: 'catalog_sources' })
export class CatalogSource {
  @PrimaryColumn('uuid')
  source_id: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  namespace: string;

  @Column({ type: 'varchar', length: 20 })
  kind: 'official' | 'local';

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity({ schema: 'account', name: 'catalog_releases' })
@Unique(['source_id', 'sequence'])
export class CatalogRelease {
  @PrimaryColumn('uuid')
  release_id: string;

  @Column('uuid')
  source_id: string;

  @Column('int')
  sequence: number;

  @Column({ type: 'varchar', length: 20 })
  schema_version: string;

  @Column({ type: 'varchar', length: 64 })
  content_digest: string;

  @Column('jsonb')
  bundle: CatalogBundleV1;

  @Column('timestamptz')
  published_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  imported_at: Date;
}

@Entity({ schema: 'account', name: 'catalog_resources' })
@Unique(['source_id', 'kind', 'slug'])
export class CatalogResource {
  @PrimaryColumn('uuid')
  resource_uid: string;

  @Column('uuid')
  source_id: string;

  @Column({ type: 'varchar', length: 30 })
  kind: CatalogResourceKind;

  @Column({ type: 'varchar', length: 240 })
  slug: string;

  @Column('int')
  head_revision: number;

  @Column({ type: 'uuid', nullable: true })
  forked_from_resource_uid: string | null;

  @Column({ type: 'int', nullable: true })
  forked_from_revision: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

@Entity({ schema: 'account', name: 'catalog_resource_revisions' })
@Unique(['resource_uid', 'revision'])
export class CatalogResourceRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  resource_uid: string;

  @Column('int')
  revision: number;

  @Column({ type: 'varchar', length: 20 })
  lifecycle: 'active' | 'deprecated' | 'retired' | 'revoked';

  @Column({ type: 'varchar', length: 64 })
  content_digest: string;

  @Column('jsonb')
  document: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity({ schema: 'account', name: 'catalog_release_entries' })
export class CatalogReleaseEntry {
  @PrimaryColumn('uuid')
  release_id: string;

  @PrimaryColumn('uuid')
  resource_uid: string;

  @Column('int')
  revision: number;
}

@Entity({ schema: 'account', name: 'catalog_runtime_state' })
export class CatalogRuntimeState {
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id: number;

  @Column('uuid')
  local_source_id: string;

  @Column({ type: 'uuid', nullable: true })
  active_official_release_id: string | null;

  @Column({ type: 'bigint', default: 0 })
  catalog_epoch: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  snapshot_digest: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

export const CATALOG_ENTITIES = [
  CatalogSource,
  CatalogRelease,
  CatalogResource,
  CatalogResourceRevision,
  CatalogReleaseEntry,
  CatalogRuntimeState,
] as const;
