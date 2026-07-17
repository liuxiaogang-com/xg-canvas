import {
  canonicalJson,
  sha256Hex,
  type CatalogChannelTemplate,
  type CatalogModelOffering,
  type CatalogProvider,
  type CatalogRateCard,
} from '@xgcanvas/model-catalog';
import type { CatalogRecord } from '../catalog';
import { ChannelInstallation } from '../channel/channel-installation.entity';
import { ModelSettings } from '../model-definition/model-settings.entity';
import { ProviderInstallation } from '../provider/provider-installation.entity';
import { RegistrySnapshotFactory } from './registry-snapshot.factory';

const MODEL_UID = '11111111-1111-4111-8111-111111111111';
const MODEL_REVISION = '22222222-2222-4222-8222-222222222222';
const PROVIDER_UID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_UID = '44444444-4444-4444-8444-444444444444';
const SOURCE_UID = '55555555-5555-4555-8555-555555555555';
const RELEASE_UID = '66666666-6666-4666-8666-666666666666';
const RATE_UID = '77777777-7777-4777-8777-777777777777';
const RATE_REVISION = '88888888-8888-4888-8888-888888888888';
const OTHER_PROVIDER_UID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_CHANNEL_UID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LOCAL_SOURCE_UID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ORPHAN_MODEL_UID = 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0';
const ORPHAN_RATE_UID = 'b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0';

describe('RegistrySnapshotFactory integrity', () => {
  const adapters = {
    has: jest.fn(() => true),
    get: jest.fn(() => ({ capabilities: ['gen.text'] })),
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects duplicate Provider slugs across Catalog sources', async () => {
    const fixture = makeFixture();
    fixture.current.push(
      currentRecord(
        { ...providerDocument(), resource_uid: OTHER_PROVIDER_UID },
        '10101010-1010-4010-8010-101010101010',
        { sourceId: LOCAL_SOURCE_UID, kind: 'local' },
      ),
    );

    await expect(build(fixture, adapters)).rejects.toThrow(
      'provider slug collision across catalog sources: example',
    );
  });

  it('rejects duplicate Channel slugs within one Provider across Catalog sources', async () => {
    const fixture = makeFixture();
    fixture.current.push(
      currentRecord(
        { ...channelDocument(), resource_uid: OTHER_CHANNEL_UID },
        '20202020-2020-4020-8020-202020202020',
        { sourceId: LOCAL_SOURCE_UID, kind: 'local' },
      ),
    );

    await expect(build(fixture, adapters)).rejects.toThrow(
      `channel slug collision for provider ${PROVIDER_UID}: example-default`,
    );
  });

  it('rejects Channel adapters not declared by its Provider', async () => {
    const fixture = makeFixture();
    currentChannel(fixture).adapter_keys = ['other-adapter'];

    await expect(build(fixture, adapters)).rejects.toThrow(
      'channel example-default uses adapters not declared by provider: other-adapter',
    );
  });

  it('rejects a current Model without an explicit allowed Channel', async () => {
    const fixture = makeFixture();
    currentModel(fixture).allowed_channel_uids = [];

    await expect(build(fixture, adapters)).rejects.toThrow(
      'model example:model has no explicitly allowed channel',
    );
  });

  it('rejects an allowed Channel that does not support the Model adapter', async () => {
    const fixture = makeFixture();
    currentProvider(fixture).adapter_keys = ['test-adapter', 'other-adapter'];
    currentChannel(fixture).adapter_keys = ['other-adapter'];

    await expect(build(fixture, adapters)).rejects.toThrow(
      'model example:model references an unavailable channel',
    );
  });

  it('fails fast when any stored historical Model revision violates the strict schema', async () => {
    const fixture = makeFixture({
      historyModels: [
        revisionRow(modelDocument(), MODEL_REVISION),
        revisionRow(
          { ...modelDocument('deprecated', 2), removed_legacy_field: true },
          '30303030-3030-4030-8030-303030303030',
        ),
      ],
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      'invalid stored model revision 30303030-3030-4030-8030-303030303030',
    );
  });

  it('fails fast when any stored historical Rate Card revision violates the strict schema', async () => {
    const fixture = makeFixture({
      historyRates: [
        revisionRow(rateDocument(), RATE_REVISION),
        revisionRow(
          { ...rateDocument('retired', 2), removed_legacy_field: true },
          '40404040-4040-4040-8040-404040404040',
        ),
      ],
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      'invalid stored Rate Card revision 40404040-4040-4040-8040-404040404040',
    );
  });

  it('fails fast when a stored historical revision no longer matches its digest', async () => {
    const fixture = makeFixture({
      historyModels: [
        {
          ...revisionRow(modelDocument(), MODEL_REVISION),
          content_digest: '0'.repeat(64),
        },
      ],
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      `Catalog revision content digest mismatch: ${MODEL_REVISION}`,
    );
  });

  it('fails fast instead of dropping an executable Model whose resource left the Catalog', async () => {
    const fixture = makeFixture({
      historyModels: [
        revisionRow(modelDocument(), MODEL_REVISION),
        revisionRow(
          { ...modelDocument(), resource_uid: ORPHAN_MODEL_UID },
          '60606060-6060-4060-8060-606060606060',
        ),
      ],
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      `historical model resource is absent from the current Catalog: ${ORPHAN_MODEL_UID}`,
    );
  });

  it('fails fast instead of dropping an executable Rate Card whose resource left the Catalog', async () => {
    const fixture = makeFixture({
      historyRates: [
        revisionRow(rateDocument(), RATE_REVISION),
        revisionRow(
          { ...rateDocument(), resource_uid: ORPHAN_RATE_UID },
          '70707070-7070-4070-8070-707070707070',
        ),
      ],
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      `historical Rate Card resource is absent from the current Catalog: ${ORPHAN_RATE_UID}`,
    );
  });

  it('fails fast when an executable historical Model revision has no Adapter contract', async () => {
    const fixture = makeFixture({
      historyModels: [
        revisionRow(modelDocument(), MODEL_REVISION),
        revisionRow(
          { ...modelDocument('active', 2), adapter_key: 'removed-adapter' },
          '50505050-5050-4050-8050-505050505050',
        ),
      ],
    });
    const selectiveAdapters = {
      has: jest.fn((key: string) => key !== 'removed-adapter'),
      get: adapters.get,
    };

    await expect(build(fixture, selectiveAdapters)).rejects.toThrow(
      'model example:model references unknown adapter removed-adapter',
    );
  });
});

interface FixtureOptions {
  historyModels?: object[];
  historyRates?: object[];
}

function makeFixture(options: FixtureOptions = {}) {
  const model = modelDocument();
  const rate = rateDocument();
  const current: CatalogRecord[] = [
    currentRecord(providerDocument(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    currentRecord(channelDocument(), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    currentRecord(model, MODEL_REVISION),
    currentRecord(rate, RATE_REVISION),
  ];
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ catalog_epoch: '7' }])
    .mockResolvedValueOnce([{
      id: 'credential-a',
      channel_resource_uid: CHANNEL_UID,
      credential_type: 'api_key',
      payload_fields: ['api_key'],
    }])
    .mockResolvedValueOnce(options.historyModels ?? [revisionRow({ ...model }, MODEL_REVISION)])
    .mockResolvedValueOnce(options.historyRates ?? [revisionRow(rate, RATE_REVISION)]);
  const manager = {
    query,
    getRepository: jest.fn((entity) => {
      if (entity === ProviderInstallation) {
        return {
          find: jest.fn(async () => [
            {
              provider_resource_uid: PROVIDER_UID,
              enabled: true,
              sort_order: 1,
              config_overrides: {},
            },
          ]),
        };
      }
      if (entity === ChannelInstallation) {
        return {
          find: jest.fn(async () => [
            {
              channel_resource_uid: CHANNEL_UID,
              enabled: true,
              priority: 1,
              config_overrides: {},
            },
          ]),
        };
      }
      if (entity === ModelSettings) {
        return {
          find: jest.fn(async () => [
            {
              model_resource_uid: MODEL_UID,
              enabled: true,
              visibility: 'public',
            },
          ]),
        };
      }
      throw new Error(`unexpected repository: ${String(entity)}`);
    }),
  };
  return {
    current,
    manager,
    catalog: { listCurrent: jest.fn(async () => current) },
  };
}

function currentProvider(fixture: ReturnType<typeof makeFixture>): CatalogProvider {
  return fixture.current.find((record) => record.document.kind === 'provider')
    ?.document as CatalogProvider;
}

function currentChannel(fixture: ReturnType<typeof makeFixture>): CatalogChannelTemplate {
  return fixture.current.find((record) => record.document.kind === 'channel_template')
    ?.document as CatalogChannelTemplate;
}

function currentModel(fixture: ReturnType<typeof makeFixture>): CatalogModelOffering {
  return fixture.current.find((record) => record.document.kind === 'model_offering')
    ?.document as CatalogModelOffering;
}

async function build(fixture: ReturnType<typeof makeFixture>, adapterRegistry: object) {
  return new RegistrySnapshotFactory(adapterRegistry as never, fixture.catalog as never).build(
    fixture.manager as never,
  );
}

function providerDocument(): CatalogProvider {
  return {
    kind: 'provider',
    resource_uid: PROVIDER_UID,
    revision: 1,
    lifecycle: 'active',
    slug: 'example',
    display_name: 'Example',
    auth_method: 'api_key',
    auth_config: {},
    invocation_methods: ['http'],
    adapter_keys: ['test-adapter'],
    supported_regions: [],
  };
}

function channelDocument(): CatalogChannelTemplate {
  return {
    kind: 'channel_template',
    resource_uid: CHANNEL_UID,
    revision: 1,
    lifecycle: 'active',
    slug: 'example-default',
    provider_uid: PROVIDER_UID,
    display_name: 'Example Default',
    invocation_method: 'http',
    adapter_keys: ['test-adapter'],
    request_config: {},
  };
}

function modelDocument(
  lifecycle: CatalogModelOffering['lifecycle'] = 'active',
  revision = 1,
): CatalogModelOffering {
  return {
    kind: 'model_offering',
    resource_uid: MODEL_UID,
    revision,
    lifecycle,
    slug: 'example:model',
    provider_uid: PROVIDER_UID,
    model_id: 'example:model',
    provider_model_id: 'upstream',
    display_name: 'Example',
    task_types: ['gen.text'],
    capabilities: [],
    invocation_mode: 'sync',
    adapter_key: 'test-adapter',
    supports_streaming: false,
    allowed_channel_uids: [CHANNEL_UID],
    tags: [],
    param_schema: { version: '1.0', groups: [], properties: {}, required: [], defaults: {} },
    param_constraints: [],
    limits: {},
    rate_card_uid: RATE_UID,
  };
}

function rateDocument(
  lifecycle: CatalogRateCard['lifecycle'] = 'active',
  revision = 1,
): CatalogRateCard {
  return {
    kind: 'rate_card',
    resource_uid: RATE_UID,
    revision,
    lifecycle,
    slug: 'example:model:default',
    model_uid: MODEL_UID,
    pricing: { currency: 'USD', components: [{ meter: 'requests', per: 1, price: 0.01 }] },
  };
}

function revisionRow(document: unknown, revisionId: string) {
  return {
    revision_id: revisionId,
    source_id: SOURCE_UID,
    source_kind: 'official',
    release_id: RELEASE_UID,
    content_digest: sha256Hex(canonicalJson(document)),
    document,
  };
}

function currentRecord<T extends CatalogRecord['document']>(
  document: T,
  revisionId: string,
  source: { sourceId: string; kind: 'official' | 'local' } = {
    sourceId: SOURCE_UID,
    kind: 'official',
  },
): CatalogRecord<T> {
  return {
    document,
    origin: {
      kind: source.kind,
      source_id: source.sourceId,
      resource_uid: document.resource_uid,
      revision: document.revision,
      revision_id: revisionId,
      release_id: source.kind === 'official' ? RELEASE_UID : null,
    },
  };
}
