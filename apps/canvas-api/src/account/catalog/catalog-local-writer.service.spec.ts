import type { CatalogRateCard } from '@xgcanvas/model-catalog';
import type { EntityManager } from 'typeorm';
import { ChannelInstallation } from '../channel/channel-installation.entity';
import { ProviderInstallation } from '../provider/provider-installation.entity';
import { CatalogResource, CatalogResourceRevision } from './catalog.entities';
import { CatalogLocalService } from './catalog-local.service';
import { CatalogLocalWriterService } from './catalog-local-writer.service';

const FORK_UID = '00000000-0000-4000-8000-000000000021';
const NEW_UID = '00000000-0000-4000-8000-000000000022';

describe('CatalogLocalWriterService fork validation', () => {
  it('requires fork uid and revision together', async () => {
    const fixture = writerFixture(null, null);

    await expect(
      fixture.writer.create(fixture.manager, rateCard(), {
        forked_from_resource_uid: FORK_UID,
      }),
    ).rejects.toThrow('fork source uid and revision must be provided together');
    expect(fixture.createResource).not.toHaveBeenCalled();
  });

  it('requires the exact fork source revision to exist', async () => {
    const missingResource = writerFixture(null, null);
    await expect(
      missingResource.writer.create(missingResource.manager, rateCard(), {
        forked_from_resource_uid: FORK_UID,
        forked_from_revision: 3,
      }),
    ).rejects.toThrow(`fork source does not exist: ${FORK_UID}@3`);

    const missingRevision = writerFixture(sourceResource('rate_card'), null);
    await expect(
      missingRevision.writer.create(missingRevision.manager, rateCard(), {
        forked_from_resource_uid: FORK_UID,
        forked_from_revision: 3,
      }),
    ).rejects.toThrow(`fork source does not exist: ${FORK_UID}@3`);
  });

  it('requires the fork source and new resource to have the same kind', async () => {
    const fixture = writerFixture(sourceResource('provider'), sourceRevision(3));

    await expect(
      fixture.writer.create(fixture.manager, rateCard(), {
        forked_from_resource_uid: FORK_UID,
        forked_from_revision: 3,
      }),
    ).rejects.toThrow('cannot fork provider as rate_card');
    expect(fixture.createResource).not.toHaveBeenCalled();
  });

  it('persists a valid exact fork reference', async () => {
    const fixture = writerFixture(sourceResource('rate_card'), sourceRevision(3));

    await expect(
      fixture.writer.create(fixture.manager, rateCard(), {
        forked_from_resource_uid: FORK_UID,
        forked_from_revision: 3,
      }),
    ).resolves.toMatchObject({ changed: true, document: { revision: 1 } });
    expect(fixture.createResource).toHaveBeenCalledWith(
      fixture.manager,
      '00000000-0000-4000-8000-000000000020',
      expect.objectContaining({
        forked_from_resource_uid: FORK_UID,
        forked_from_revision: 3,
      }),
    );
  });
});

describe('CatalogLocalWriterService outbound runtime overrides', () => {
  it('rejects a secret-like key nested inside Channel request_config', async () => {
    const fixture = settingsWriterFixture('channel_template');

    await expect(
      fixture.writer.patchChannelSettings(fixture.manager, NEW_UID, {
        config_overrides: {
          request_config: { headers: { Authorization: 'Bearer secret' } },
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'CATALOG_OUTBOUND_CONFIG_INVALID' } });
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it('rejects a secret-like key nested inside Provider auth_config', async () => {
    const fixture = settingsWriterFixture('provider');

    await expect(
      fixture.writer.patchProviderSettings(fixture.manager, NEW_UID, {
        config_overrides: {
          auth_config: { headers: { Authorization: 'Bearer secret' } },
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'CATALOG_OUTBOUND_CONFIG_INVALID' } });
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it.each([
    'http://gateway.example/v1',
    'https://user:password@gateway.example/v1',
    'https://gateway.example/v1?access_token=secret',
  ])('rejects unsafe Provider endpoint override %s', async (baseUrl) => {
    const fixture = settingsWriterFixture('provider');

    await expect(
      fixture.writer.patchProviderSettings(fixture.manager, NEW_UID, {
        config_overrides: { base_url: baseUrl },
      }),
    ).rejects.toMatchObject({ response: { code: 'CATALOG_OUTBOUND_CONFIG_INVALID' } });
    expect(fixture.save).not.toHaveBeenCalled();
  });
});

function writerFixture(
  source: CatalogResource | null,
  revision: CatalogResourceRevision | null,
): {
  writer: CatalogLocalWriterService;
  manager: EntityManager;
  createResource: jest.Mock;
} {
  const createResource = jest.fn(async () => sourceRevision(1));
  const local = {
    getLocalSourceId: jest.fn(async () => '00000000-0000-4000-8000-000000000020'),
    createResource,
  } as unknown as CatalogLocalService;
  const resourceRepo = { findOneBy: jest.fn(async () => source) };
  const revisionRepo = { findOneBy: jest.fn(async () => revision) };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CatalogResource) return resourceRepo;
      if (entity === CatalogResourceRevision) return revisionRepo;
      throw new Error('unexpected repository');
    }),
  } as unknown as EntityManager;
  return { writer: new CatalogLocalWriterService(local), manager, createResource };
}

function settingsWriterFixture(kind: 'provider' | 'channel_template'): {
  writer: CatalogLocalWriterService;
  manager: EntityManager;
  save: jest.Mock;
} {
  const save = jest.fn();
  const resourceRepo = { findOneBy: jest.fn(async () => ({ kind })) };
  const settingsRepo = {
    findOneBy: jest.fn(),
    create: jest.fn((value) => value),
    save,
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CatalogResource) return resourceRepo;
      if (entity === ProviderInstallation || entity === ChannelInstallation) return settingsRepo;
      throw new Error('unexpected repository');
    }),
  } as unknown as EntityManager;
  return {
    writer: new CatalogLocalWriterService({} as CatalogLocalService),
    manager,
    save,
  };
}

function sourceResource(kind: CatalogResource['kind']): CatalogResource {
  return {
    resource_uid: FORK_UID,
    source_id: '00000000-0000-4000-8000-000000000001',
    kind,
    slug: 'fork-source',
    head_revision: 3,
    forked_from_resource_uid: null,
    forked_from_revision: null,
  } as CatalogResource;
}

function sourceRevision(revision: number): CatalogResourceRevision {
  return {
    resource_uid: FORK_UID,
    revision,
    lifecycle: 'active',
    content_digest: 'a'.repeat(64),
    document: {},
  } as CatalogResourceRevision;
}

function rateCard(): CatalogRateCard {
  return {
    resource_uid: NEW_UID,
    revision: 7,
    slug: 'example-rate',
    lifecycle: 'active',
    kind: 'rate_card',
    model_uid: '00000000-0000-4000-8000-000000000023',
    pricing: {
      currency: 'USD',
      components: [{ meter: 'requests', per: 1, price: 0.01 }],
    },
  };
}
