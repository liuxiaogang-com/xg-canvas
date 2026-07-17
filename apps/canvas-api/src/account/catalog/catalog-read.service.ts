import { Injectable } from '@nestjs/common';
import {
  canonicalJson,
  CatalogChannelTemplateSchema,
  CatalogModelOfferingSchema,
  CatalogProviderSchema,
  CatalogRateCardSchema,
  sha256Hex,
  type CatalogChannelTemplate,
  type CatalogModelOffering,
  type CatalogProvider,
  type CatalogRateCard,
  type CatalogResourceKind,
} from '@xgcanvas/model-catalog';
import type { CatalogOrigin } from '@xgcanvas/shared-types';
import { DataSource, type EntityManager } from 'typeorm';

export type CatalogReadableDocument =
  | CatalogProvider
  | CatalogChannelTemplate
  | CatalogModelOffering
  | CatalogRateCard;

export interface CatalogRecord<T extends CatalogReadableDocument = CatalogReadableDocument> {
  document: T;
  origin: CatalogOrigin;
}

interface CatalogRecordRow {
  resource_uid: string;
  kind: CatalogResourceKind;
  source_id: string;
  source_kind: 'official' | 'local';
  revision_id: string;
  revision: number;
  release_id: string | null;
  content_digest: string;
  document: unknown;
}

@Injectable()
export class CatalogReadService {
  constructor(private readonly dataSource: DataSource) {}

  async listCurrent<T extends CatalogReadableDocument = CatalogReadableDocument>(
    kind?: CatalogResourceKind,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<CatalogRecord<T>[]> {
    const rows = await manager.query<CatalogRecordRow[]>(CURRENT_CATALOG_SQL, [kind ?? null]);
    return rows.map((row) => parseRecord(row) as CatalogRecord<T>);
  }

  async findCurrent<T extends CatalogReadableDocument = CatalogReadableDocument>(
    resourceUid: string,
    kind?: CatalogResourceKind,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<CatalogRecord<T> | null> {
    const rows = await manager.query<CatalogRecordRow[]>(
      `${CURRENT_CATALOG_SQL} AND current.resource_uid = $2`,
      [kind ?? null, resourceUid],
    );
    return rows[0] ? (parseRecord(rows[0]) as CatalogRecord<T>) : null;
  }

  async findRevision<T extends CatalogReadableDocument = CatalogReadableDocument>(
    revisionId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<CatalogRecord<T> | null> {
    const rows = await manager.query<CatalogRecordRow[]>(REVISION_SQL, [revisionId]);
    return rows[0] ? (parseRecord(rows[0]) as CatalogRecord<T>) : null;
  }
}

const CURRENT_CATALOG_SQL = `
  WITH current AS (
    SELECT r.resource_uid, r.kind, r.source_id, s.kind AS source_kind,
           rr.id AS revision_id, rr.revision, re.release_id, rr.content_digest, rr.document
      FROM account.catalog_runtime_state state
      JOIN account.catalog_release_entries re
        ON re.release_id = state.active_official_release_id
      JOIN account.catalog_resources r ON r.resource_uid = re.resource_uid
      JOIN account.catalog_sources s ON s.source_id = r.source_id
      JOIN account.catalog_resource_revisions rr
        ON rr.resource_uid = re.resource_uid AND rr.revision = re.revision
     WHERE state.id = 1
    UNION ALL
    SELECT r.resource_uid, r.kind, r.source_id, s.kind AS source_kind,
           rr.id AS revision_id, rr.revision, NULL::uuid AS release_id, rr.content_digest, rr.document
      FROM account.catalog_runtime_state state
      JOIN account.catalog_resources r ON r.source_id = state.local_source_id
      JOIN account.catalog_sources s ON s.source_id = r.source_id
      JOIN account.catalog_resource_revisions rr
        ON rr.resource_uid = r.resource_uid AND rr.revision = r.head_revision
     WHERE state.id = 1
  )
  SELECT * FROM current
   WHERE ($1::varchar IS NULL OR current.kind = $1)`;

const REVISION_SQL = `
  SELECT r.resource_uid, r.kind, r.source_id, s.kind AS source_kind,
         rr.id AS revision_id, rr.revision, rr.content_digest,
         CASE WHEN s.kind = 'official' THEN latest.release_id ELSE NULL END AS release_id,
         rr.document
    FROM account.catalog_resource_revisions rr
    JOIN account.catalog_resources r ON r.resource_uid = rr.resource_uid
    JOIN account.catalog_sources s ON s.source_id = r.source_id
    LEFT JOIN LATERAL (
      SELECT re.release_id
        FROM account.catalog_release_entries re
        JOIN account.catalog_releases rel ON rel.release_id = re.release_id
       WHERE re.resource_uid = rr.resource_uid AND re.revision = rr.revision
       ORDER BY rel.sequence DESC LIMIT 1
    ) latest ON true
   WHERE rr.id = $1`;

function parseRecord(row: CatalogRecordRow): CatalogRecord {
  if (sha256Hex(canonicalJson(row.document)) !== row.content_digest) {
    throw new Error(`Catalog revision content digest mismatch: ${row.revision_id}`);
  }
  const document = parseDocument(row.kind, row.document);
  if (document.resource_uid !== row.resource_uid || document.revision !== row.revision) {
    throw new Error(`Catalog revision identity mismatch: ${row.revision_id}`);
  }
  return {
    document,
    origin: {
      kind: row.source_kind,
      source_id: row.source_id,
      resource_uid: row.resource_uid,
      revision: row.revision,
      revision_id: row.revision_id,
      release_id: row.source_kind === 'official' ? row.release_id : null,
    },
  };
}

function parseDocument(kind: CatalogResourceKind, value: unknown): CatalogReadableDocument {
  switch (kind) {
    case 'provider':
      return CatalogProviderSchema.parse(value) as CatalogProvider;
    case 'channel_template':
      return CatalogChannelTemplateSchema.parse(value) as CatalogChannelTemplate;
    case 'model_offering':
      return CatalogModelOfferingSchema.parse(value) as CatalogModelOffering;
    case 'rate_card':
      return CatalogRateCardSchema.parse(value) as CatalogRateCard;
  }
}
