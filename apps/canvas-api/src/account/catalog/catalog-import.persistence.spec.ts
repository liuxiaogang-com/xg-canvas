import type { CatalogBundleV1, CatalogProvider } from '@xgcanvas/model-catalog';
import { canonicalJson, sha256Hex } from '@xgcanvas/model-catalog';
import type { EntityManager } from 'typeorm';
import { CatalogReleaseEntry, CatalogResource, CatalogResourceRevision } from './catalog.entities';
import { persistCatalogResources } from './catalog-import.persistence';

const SOURCE_ID = '00000000-0000-4000-8000-000000000001';
const RESOURCE_UID = '00000000-0000-4000-8000-000000000002';

describe('persistCatalogResources revision continuity', () => {
  it('requires a new official resource to start at revision 1', async () => {
    const fixture = persistenceFixture(null);

    await expect(
      persistCatalogResources(
        fixture.manager,
        bundle(provider(2), '00000000-0000-4000-8000-000000000012'),
      ),
    ).rejects.toThrow('must start at revision 1');
    expect(fixture.resourceSave).not.toHaveBeenCalled();
  });

  it('accepts an idempotent re-import of the current revision and digest', async () => {
    const document = provider(1);
    const fixture = persistenceFixture(storedResource(1), storedRevision(document));

    await expect(
      persistCatalogResources(
        fixture.manager,
        bundle(document, '00000000-0000-4000-8000-000000000013'),
      ),
    ).resolves.toBeInstanceOf(Map);
    expect(fixture.resourceSave).not.toHaveBeenCalled();
    expect(fixture.revisionSave).not.toHaveBeenCalled();
  });

  it('rejects changing the current revision in place', async () => {
    const document = provider(1);
    const fixture = persistenceFixture(storedResource(1), {
      ...storedRevision(document),
      content_digest: 'f'.repeat(64),
    });

    await expect(
      persistCatalogResources(
        fixture.manager,
        bundle(document, '00000000-0000-4000-8000-000000000014'),
      ),
    ).rejects.toThrow(`${RESOURCE_UID}@1 changed in place`);
  });

  it('accepts exactly head + 1 and advances the resource head', async () => {
    const previous = provider(1);
    const fixture = persistenceFixture(storedResource(1), storedRevision(previous), null);

    await expect(
      persistCatalogResources(
        fixture.manager,
        bundle(provider(2), '00000000-0000-4000-8000-000000000015'),
      ),
    ).resolves.toBeInstanceOf(Map);
    expect(fixture.resourceSave).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_uid: RESOURCE_UID,
        head_revision: 2,
      }),
    );
    expect(fixture.revisionSave).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_uid: RESOURCE_UID,
        revision: 2,
      }),
    );
  });

  it('rejects skipped and historical revisions', async () => {
    const head = provider(2);
    const skipped = persistenceFixture(storedResource(2), storedRevision(head), null);
    await expect(
      persistCatalogResources(
        skipped.manager,
        bundle(provider(4), '00000000-0000-4000-8000-000000000016'),
      ),
    ).rejects.toThrow('must be current revision 2 or next revision 3');

    const historical = persistenceFixture(
      storedResource(2),
      storedRevision(head),
      storedRevision(provider(1)),
    );
    await expect(
      persistCatalogResources(
        historical.manager,
        bundle(provider(1), '00000000-0000-4000-8000-000000000017'),
      ),
    ).rejects.toThrow('must be current revision 2 or next revision 3');
  });
});

function persistenceFixture(
  resource: CatalogResource | null,
  headRevision: CatalogResourceRevision | null = null,
  incomingRevision: CatalogResourceRevision | null = headRevision,
): {
  manager: EntityManager;
  resourceSave: jest.Mock;
  revisionSave: jest.Mock;
} {
  const resourceSave = jest.fn(async (value: CatalogResource) => value);
  const revisionSave = jest.fn(async (value: CatalogResourceRevision) => value);
  const entrySave = jest.fn(async (value: CatalogReleaseEntry) => value);
  const resourceRepo = {
    findOneBy: jest.fn(async (where: Partial<CatalogResource>) => {
      if ('resource_uid' in where) return resource;
      return null;
    }),
    findOneByOrFail: jest.fn(),
    create: jest.fn((value: CatalogResource) => value),
    save: resourceSave,
  };
  const revisionRepo = {
    findOneByOrFail: jest.fn(async () => {
      if (!headRevision) throw new Error('missing head revision');
      return headRevision;
    }),
    findOneBy: jest.fn(async (where: Partial<CatalogResourceRevision>) => {
      return where.revision === incomingRevision?.revision ? incomingRevision : null;
    }),
    create: jest.fn((value: CatalogResourceRevision) => value),
    save: revisionSave,
  };
  const entryRepo = {
    findOneBy: jest.fn(async () => null),
    create: jest.fn((value: CatalogReleaseEntry) => value),
    save: entrySave,
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CatalogResource) return resourceRepo;
      if (entity === CatalogResourceRevision) return revisionRepo;
      if (entity === CatalogReleaseEntry) return entryRepo;
      throw new Error('unexpected repository');
    }),
  } as unknown as EntityManager;
  return { manager, resourceSave, revisionSave };
}

function provider(revision: number): CatalogProvider {
  return {
    resource_uid: RESOURCE_UID,
    revision,
    slug: 'example',
    lifecycle: 'active',
    kind: 'provider',
    display_name: 'Example',
    auth_method: 'api_key',
    invocation_methods: ['http'],
    adapter_keys: ['openai-compat'],
    supported_regions: [],
  };
}

function storedResource(headRevision: number): CatalogResource {
  return {
    resource_uid: RESOURCE_UID,
    source_id: SOURCE_ID,
    kind: 'provider',
    slug: 'example',
    head_revision: headRevision,
    forked_from_resource_uid: null,
    forked_from_revision: null,
  } as CatalogResource;
}

function storedRevision(document: CatalogProvider): CatalogResourceRevision {
  const serialized = canonicalJson(document);
  return {
    resource_uid: document.resource_uid,
    revision: document.revision,
    lifecycle: document.lifecycle,
    content_digest: sha256Hex(serialized),
    document: JSON.parse(serialized) as Record<string, unknown>,
  } as CatalogResourceRevision;
}

function bundle(document: CatalogProvider, releaseId: string): CatalogBundleV1 {
  return {
    format: 'xgcanvas.catalog.bundle',
    schema_version: '1',
    source: { source_id: SOURCE_ID, namespace: 'xgcanvas.official', kind: 'official' },
    release: {
      release_id: releaseId,
      sequence: Number(releaseId.slice(-2)),
      published_at: '2026-07-16T00:00:00Z',
    },
    providers: [document],
    channel_templates: [],
    model_offerings: [],
    rate_cards: [],
  };
}
