import { ConflictException, Injectable } from '@nestjs/common';
import { canonicalJson, sha256Hex, type CatalogResourceKind } from '@xgcanvas/model-catalog';
import type { EntityManager } from 'typeorm';
import { CatalogResource, CatalogResourceRevision, CatalogRuntimeState } from './catalog.entities';
import { assertCatalogLifecycleTransition } from './catalog-import.persistence';
import { assertStableCatalogOwner } from './catalog-owner';

export interface CreateLocalResourceInput {
  resource_uid: string;
  kind: CatalogResourceKind;
  slug: string;
  document: Record<string, unknown>;
  forked_from_resource_uid?: string;
  forked_from_revision?: number;
}

@Injectable()
export class CatalogLocalService {
  async createResource(
    manager: EntityManager,
    sourceId: string,
    input: CreateLocalResourceInput,
  ): Promise<CatalogResourceRevision> {
    const resourceRepo = manager.getRepository(CatalogResource);
    if (await resourceRepo.findOneBy({ resource_uid: input.resource_uid })) {
      throw new ConflictException(`Catalog resource already exists: ${input.resource_uid}`);
    }
    const slugOwner = await resourceRepo.findOneBy({
      source_id: sourceId,
      kind: input.kind,
      slug: input.slug,
    });
    if (slugOwner) {
      throw new ConflictException(`Catalog ${input.kind} slug already exists: ${input.slug}`);
    }
    if (
      input.document.resource_uid !== input.resource_uid ||
      input.document.kind !== input.kind ||
      input.document.slug !== input.slug
    )
      throw new Error('local Catalog resource identity does not match its document');

    await resourceRepo.save(
      resourceRepo.create({
        resource_uid: input.resource_uid,
        source_id: sourceId,
        kind: input.kind,
        slug: input.slug,
        head_revision: 1,
        forked_from_resource_uid: input.forked_from_resource_uid ?? null,
        forked_from_revision: input.forked_from_revision ?? null,
      }),
    );
    return this.saveRevision(manager, input.resource_uid, 1, input.document);
  }

  async appendRevision(
    manager: EntityManager,
    resourceUid: string,
    expectedRevision: number,
    document: Record<string, unknown>,
  ): Promise<CatalogResourceRevision> {
    const resourceRepo = manager.getRepository(CatalogResource);
    const resource = await resourceRepo.findOneByOrFail({ resource_uid: resourceUid });
    if (resource.head_revision !== expectedRevision) {
      throw new ConflictException({
        code: 'CATALOG_REVISION_CONFLICT',
        message: `expected revision ${expectedRevision}, current revision is ${resource.head_revision}`,
      });
    }
    const current = await manager.getRepository(CatalogResourceRevision).findOneByOrFail({
      resource_uid: resourceUid,
      revision: expectedRevision,
    });
    const nextRevision = expectedRevision + 1;
    const nextDocument: Record<string, unknown> = {
      ...document,
      resource_uid: resourceUid,
      revision: nextRevision,
    };
    assertStableCatalogOwner(current.document, nextDocument);
    assertCatalogLifecycleTransition(
      current.lifecycle,
      String(nextDocument.lifecycle ?? 'active') as CatalogResourceRevision['lifecycle'],
      resourceUid,
    );
    const saved = await this.saveRevision(manager, resourceUid, nextRevision, nextDocument);
    resource.head_revision = nextRevision;
    await resourceRepo.save(resource);
    return saved;
  }

  async getLocalSourceId(manager: EntityManager): Promise<string> {
    const state = await manager.getRepository(CatalogRuntimeState).findOneByOrFail({ id: 1 });
    return state.local_source_id;
  }

  private async saveRevision(
    manager: EntityManager,
    resourceUid: string,
    revision: number,
    document: Record<string, unknown>,
  ): Promise<CatalogResourceRevision> {
    const normalized: Record<string, unknown> = {
      ...document,
      resource_uid: resourceUid,
      revision,
    };
    const serialized = canonicalJson(normalized);
    return manager.getRepository(CatalogResourceRevision).save({
      resource_uid: resourceUid,
      revision,
      lifecycle: String(normalized.lifecycle ?? 'active') as CatalogResourceRevision['lifecycle'],
      content_digest: sha256Hex(serialized),
      document: JSON.parse(serialized) as Record<string, unknown>,
    });
  }
}
