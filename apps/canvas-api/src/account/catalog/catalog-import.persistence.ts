import type {
  CatalogBundleV1,
  CatalogResourceBase,
  CatalogResourceKind,
} from '@xgcanvas/model-catalog';
import { canonicalJson, sha256Hex } from '@xgcanvas/model-catalog';
import type { EntityManager } from 'typeorm';
import {
  CatalogRelease,
  CatalogReleaseEntry,
  CatalogResource,
  CatalogResourceRevision,
  CatalogSource,
} from './catalog.entities';
import { assertStableCatalogOwner } from './catalog-owner';

type BundleResource = CatalogResourceBase & { kind: CatalogResourceKind };

export async function ensureCatalogSource(
  manager: EntityManager,
  bundle: CatalogBundleV1,
): Promise<void> {
  const repo = manager.getRepository(CatalogSource);
  const byId = await repo.findOneBy({ source_id: bundle.source.source_id });
  const byNamespace = await repo.findOneBy({ namespace: bundle.source.namespace });
  const current = byId ?? byNamespace;
  if (current) {
    if (
      current.source_id !== bundle.source.source_id ||
      current.namespace !== bundle.source.namespace ||
      current.kind !== bundle.source.kind
    )
      throw new Error('Catalog source identity does not match the stored source');
    return;
  }
  await repo.save(repo.create(bundle.source));
}

export async function ensureCatalogRelease(
  manager: EntityManager,
  bundle: CatalogBundleV1,
  digest: string,
): Promise<void> {
  const repo = manager.getRepository(CatalogRelease);
  const byId = await repo.findOneBy({ release_id: bundle.release.release_id });
  const bySequence = await repo.findOneBy({
    source_id: bundle.source.source_id,
    sequence: bundle.release.sequence,
  });
  const current = byId ?? bySequence;
  if (current) {
    if (
      current.release_id !== bundle.release.release_id ||
      current.source_id !== bundle.source.source_id ||
      current.sequence !== bundle.release.sequence ||
      current.content_digest !== digest
    ) {
      throw new Error(
        `Catalog release sequence ${bundle.release.sequence} already has different content`,
      );
    }
    return;
  }
  await repo.save(
    repo.create({
      release_id: bundle.release.release_id,
      source_id: bundle.source.source_id,
      sequence: bundle.release.sequence,
      schema_version: bundle.schema_version,
      content_digest: digest,
      bundle,
      published_at: new Date(bundle.release.published_at),
    }),
  );
}

export async function persistCatalogResources(
  manager: EntityManager,
  bundle: CatalogBundleV1,
): Promise<Map<string, CatalogResourceRevision>> {
  const resourceRepo = manager.getRepository(CatalogResource);
  const revisionRepo = manager.getRepository(CatalogResourceRevision);
  const entryRepo = manager.getRepository(CatalogReleaseEntry);
  const revisionByUid = new Map<string, CatalogResourceRevision>();

  for (const document of allCatalogResources(bundle)) {
    const documentJson = canonicalJson(document);
    const documentDigest = sha256Hex(documentJson);
    let resource = await resourceRepo.findOneBy({ resource_uid: document.resource_uid });
    let revision: CatalogResourceRevision;
    if (resource) {
      if (resource.source_id !== bundle.source.source_id || resource.kind !== document.kind) {
        throw new Error(`Catalog resource identity collision: ${document.resource_uid}`);
      }
      const head = await revisionRepo.findOneByOrFail({
        resource_uid: resource.resource_uid,
        revision: resource.head_revision,
      });
      assertStableCatalogOwner(head.document, document as unknown as Record<string, unknown>);
      if (
        document.revision !== resource.head_revision &&
        document.revision !== resource.head_revision + 1
      ) {
        throw new Error(
          `Catalog resource ${document.resource_uid} must be current revision ` +
            `${resource.head_revision} or next revision ${resource.head_revision + 1}`,
        );
      }
      if (document.revision === resource.head_revision) {
        if (head.content_digest !== documentDigest) {
          throw new Error(
            `Catalog resource ${document.resource_uid}@${document.revision} changed in place`,
          );
        }
        revision = head;
      } else {
        assertCatalogLifecycleTransition(head.lifecycle, document.lifecycle, document.resource_uid);
        const existingNext = await revisionRepo.findOneBy({
          resource_uid: document.resource_uid,
          revision: document.revision,
        });
        if (existingNext && existingNext.content_digest !== documentDigest) {
          throw new Error(
            `Catalog resource ${document.resource_uid}@${document.revision} changed in place`,
          );
        }
        revision =
          existingNext ??
          (await revisionRepo.save(
            revisionRepo.create({
              resource_uid: document.resource_uid,
              revision: document.revision,
              lifecycle: document.lifecycle,
              content_digest: documentDigest,
              document: JSON.parse(documentJson) as Record<string, unknown>,
            }),
          ));
        resource.head_revision = document.revision;
        resource = await resourceRepo.save(resource);
      }
    } else {
      if (document.revision !== 1) {
        throw new Error(`Catalog resource ${document.resource_uid} must start at revision 1`);
      }
      const slugOwner = await resourceRepo.findOneBy({
        source_id: bundle.source.source_id,
        kind: document.kind,
        slug: document.slug,
      });
      if (slugOwner) {
        throw new Error(
          `Catalog ${document.kind} slug ${document.slug} already belongs to ${slugOwner.resource_uid}`,
        );
      }
      resource = await resourceRepo.save(
        resourceRepo.create({
          resource_uid: document.resource_uid,
          source_id: bundle.source.source_id,
          kind: document.kind,
          slug: document.slug,
          head_revision: document.revision,
          forked_from_resource_uid: null,
          forked_from_revision: null,
        }),
      );
      revision = await revisionRepo.save(
        revisionRepo.create({
          resource_uid: document.resource_uid,
          revision: document.revision,
          lifecycle: document.lifecycle,
          content_digest: documentDigest,
          document: JSON.parse(documentJson) as Record<string, unknown>,
        }),
      );
    }
    revisionByUid.set(document.resource_uid, revision);

    const entry = await entryRepo.findOneBy({
      release_id: bundle.release.release_id,
      resource_uid: document.resource_uid,
    });
    if (entry && entry.revision !== document.revision) {
      throw new Error(`Catalog release entry changed in place: ${document.resource_uid}`);
    }
    if (!entry)
      await entryRepo.save(
        entryRepo.create({
          release_id: bundle.release.release_id,
          resource_uid: document.resource_uid,
          revision: document.revision,
        }),
      );
  }
  return revisionByUid;
}

export async function ensureCatalogInstallations(
  manager: EntityManager,
  bundle: CatalogBundleV1,
): Promise<void> {
  for (const provider of bundle.providers) {
    await manager.query(
      `INSERT INTO account.provider_installations(provider_resource_uid)
       VALUES ($1) ON CONFLICT (provider_resource_uid) DO NOTHING`,
      [provider.resource_uid],
    );
  }
  for (const channel of bundle.channel_templates) {
    await manager.query(
      `INSERT INTO account.channel_installations(channel_resource_uid)
       VALUES ($1) ON CONFLICT (channel_resource_uid) DO NOTHING`,
      [channel.resource_uid],
    );
  }
  for (const model of bundle.model_offerings) {
    await manager.query(
      `INSERT INTO account.model_settings(model_resource_uid)
       VALUES ($1) ON CONFLICT (model_resource_uid) DO NOTHING`,
      [model.resource_uid],
    );
  }
}

export function assertCatalogReleaseContinuity(
  active: CatalogRelease | null,
  next: CatalogBundleV1,
): void {
  if (!active || active.release_id === next.release.release_id) return;
  const nextUids = new Set(allCatalogResources(next).map((resource) => resource.resource_uid));
  const removed = allCatalogResources(active.bundle)
    .map((resource) => resource.resource_uid)
    .filter((uid) => !nextUids.has(uid));
  if (removed.length > 0) {
    throw new Error(
      `Catalog release cannot implicitly remove resources; append terminal revisions: ${removed.join(', ')}`,
    );
  }
}

export function assertCatalogOfficialSource(
  active: CatalogRelease | null,
  next: CatalogBundleV1,
): void {
  if (active && active.source_id !== next.source.source_id) {
    throw new Error(
      `active official Catalog source ${active.source_id} cannot be replaced by ` +
        `${next.source.source_id}`,
    );
  }
}

export function effectiveCatalogRelease(
  active: CatalogRelease | null,
  incoming: CatalogBundleV1,
  incomingDigest: string,
  newerActive: boolean,
): { bundle: CatalogBundleV1; digest: string } {
  if (!newerActive) return { bundle: incoming, digest: incomingDigest };
  if (!active) throw new Error('newer active Catalog release metadata is missing');
  return { bundle: active.bundle, digest: active.content_digest };
}

export function assertCatalogLifecycleTransition(
  previous: CatalogResourceRevision['lifecycle'],
  next: CatalogResourceRevision['lifecycle'],
  resourceUid: string,
): void {
  if (previous === 'revoked' && next !== 'revoked') {
    throw new Error(`revoked Catalog resource cannot be restored: ${resourceUid}`);
  }
  if (previous === 'retired' && next !== 'retired' && next !== 'revoked') {
    throw new Error(`retired Catalog resource cannot become current again: ${resourceUid}`);
  }
}

export function allCatalogResources(bundle: CatalogBundleV1): BundleResource[] {
  return [
    ...bundle.providers,
    ...bundle.channel_templates,
    ...bundle.model_offerings,
    ...bundle.rate_cards,
  ];
}
