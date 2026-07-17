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
import type { EnabledCredentialSnapshotRow } from './registry-snapshot.integrity';

const MODEL_UID = '11111111-1111-4111-8111-111111111111';
const MODEL_REVISION = '22222222-2222-4222-8222-222222222222';
const PROVIDER_UID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_UID = '44444444-4444-4444-8444-444444444444';
const SOURCE_UID = '55555555-5555-4555-8555-555555555555';
const RELEASE_UID = '66666666-6666-4666-8666-666666666666';
const RATE_UID = '77777777-7777-4777-8777-777777777777';
const RATE_REVISION = '88888888-8888-4888-8888-888888888888';
const TERMINAL_REVISION = '99999999-9999-4999-8999-999999999999';
const OTHER_MODEL_UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('RegistrySnapshotFactory', () => {
  const adapters = {
    has: jest.fn(() => true),
    get: jest.fn(() => ({ capabilities: ['gen.text'] })),
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects a current Model whose declared Rate Card revision is unavailable', async () => {
    const fixture = makeFixture({ includeCurrentRate: false, historyRates: [] });

    await expect(build(fixture, adapters)).rejects.toThrow(
      'model has no active Rate Card: example:model',
    );
  });

  it('rejects a Rate Card owned by a different Model resource UID', async () => {
    const foreignRate = rateDocument('active', 1, OTHER_MODEL_UID);
    const fixture = makeFixture({
      currentRate: foreignRate,
      historyRates: [revisionRow(foreignRate, RATE_REVISION)],
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      `active Rate Card ${RATE_UID} is not linked by its current Model ${OTHER_MODEL_UID}`,
    );
  });

  it('rejects an active orphan Rate Card after its owner Model becomes terminal', async () => {
    const fixture = makeFixture({
      currentModel: modelDocument('retired', 2, false),
      historyModels: [],
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      `active Rate Card ${RATE_UID} is not linked by its current Model ${MODEL_UID}`,
    );
  });

  it('rejects an active Rate Card no longer linked by its active owner Model', async () => {
    const fixture = makeFixture({
      currentModel: modelDocument('active', 1, false),
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      `active Rate Card ${RATE_UID} is not linked by its current Model ${MODEL_UID}`,
    );
  });

  it('composes current Catalog revisions, runtime settings, Credentials, and exact pins', async () => {
    const fixture = makeFixture();
    const snapshot = await build(fixture, adapters);

    expect(snapshot.byId.get('example:model')?.pin).toEqual({
      model_resource_uid: MODEL_UID,
      model_revision_id: MODEL_REVISION,
      rate_card_revision_id: RATE_REVISION,
      catalog_epoch: '7',
    });
    expect(snapshot.byId.get('example:model')?.allowed_channel_resource_uids).toEqual([
      CHANNEL_UID,
    ]);
    expect(snapshot.providersByResourceUid.get(PROVIDER_UID)).toMatchObject({
      enabled: true,
      config_overrides: { base_url: 'https://proxy.example/v1' },
    });
    expect(snapshot.channelsByResourceUid.get(CHANNEL_UID)).toMatchObject({
      enabled: true,
      enabled_credential_ids: ['credential-a'],
    });
    expect(snapshot.content_digest).toMatch(/^[a-f0-9]{64}$/);
    const credentialSql = fixture.manager.query.mock.calls[1][0] as string;
    expect(credentialSql).toMatch(
      /SELECT id, channel_resource_uid, credential_type, payload_fields/,
    );
    expect(credentialSql).toMatch(/enabled = true AND archived_at IS NULL/);
  });

  it('rejects the whole candidate Snapshot when an enabled Credential violates auth metadata', async () => {
    const fixture = makeFixture({
      credentialRows: [
        {
          id: 'credential-invalid',
          channel_resource_uid: CHANNEL_UID,
          credential_type: 'api_key',
          payload_fields: ['api_key', 'unexpected'],
        },
      ],
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      'enabled credential credential-invalid does not match provider example auth_method api_key',
    );
  });

  it('removes a retired Model from new selection but keeps its prior active revision', async () => {
    const active = modelDocument('active', 1, false);
    const retired = modelDocument('retired', 2, false);
    const fixture = makeFixture({
      currentModel: retired,
      includeCurrentRate: false,
      historyModels: [revisionRow(active, MODEL_REVISION), revisionRow(retired, TERMINAL_REVISION)],
      historyRates: [],
    });
    const snapshot = await build(fixture, adapters);

    expect(snapshot.byId.has('example:model')).toBe(false);
    expect(snapshot.byRevisionId.has(MODEL_REVISION)).toBe(true);
    expect(snapshot.byRevisionId.has(TERMINAL_REVISION)).toBe(false);
  });

  it('removes every historical Model revision after the current resource is revoked', async () => {
    const active = modelDocument('active', 1, false);
    const revoked = modelDocument('revoked', 2, false);
    const fixture = makeFixture({
      currentModel: revoked,
      includeCurrentRate: false,
      historyModels: [revisionRow(active, MODEL_REVISION), revisionRow(revoked, TERMINAL_REVISION)],
      historyRates: [],
    });
    const snapshot = await build(fixture, adapters);

    expect(snapshot.byId.size).toBe(0);
    expect(snapshot.byRevisionId.size).toBe(0);
  });

  it('keeps an old active Rate Card revision after retirement', async () => {
    const activeRate = rateDocument('active', 1);
    const retiredRate = rateDocument('retired', 2);
    const fixture = makeFixture({
      currentModel: modelDocument('retired', 2, false),
      currentRate: retiredRate,
      historyModels: [],
      historyRates: [
        revisionRow(activeRate, RATE_REVISION),
        revisionRow(retiredRate, TERMINAL_REVISION),
      ],
    });
    const snapshot = await build(fixture, adapters);

    expect(snapshot.rateCardsByRevisionId.has(RATE_REVISION)).toBe(true);
    expect(snapshot.rateCardsByRevisionId.has(TERMINAL_REVISION)).toBe(false);
  });

  it('removes every Rate Card revision after revocation', async () => {
    const activeRate = rateDocument('active', 1);
    const revokedRate = rateDocument('revoked', 2);
    const fixture = makeFixture({
      currentModel: modelDocument('retired', 2, false),
      currentRate: revokedRate,
      historyModels: [],
      historyRates: [
        revisionRow(activeRate, RATE_REVISION),
        revisionRow(revokedRate, TERMINAL_REVISION),
      ],
    });
    const snapshot = await build(fixture, adapters);

    expect(snapshot.rateCardsByRevisionId.size).toBe(0);
  });

  it('fails the whole candidate Snapshot for an unsafe endpoint override', async () => {
    const fixture = makeFixture({
      providerOverrides: { base_url: 'https://gateway.example/v1?api_key=secret' },
    });

    await expect(build(fixture, adapters)).rejects.toThrow('has unsafe base_url override');
  });

  it('fails the whole candidate Snapshot for a nested secret-like request config', async () => {
    const fixture = makeFixture({
      channelOverrides: { request_config: { headers: { Authorization: 'Bearer secret' } } },
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      'has unsafe request_config override: headers.Authorization',
    );
  });

  it('fails the whole candidate Snapshot for a nested secret-like auth config', async () => {
    const fixture = makeFixture({
      providerOverrides: { auth_config: { headers: { Authorization: 'Bearer secret' } } },
    });

    await expect(build(fixture, adapters)).rejects.toThrow(
      'has unsafe auth_config override: headers.Authorization',
    );
  });
});

interface FixtureOptions {
  currentModel?: CatalogModelOffering;
  currentRate?: CatalogRateCard;
  includeCurrentRate?: boolean;
  historyModels?: object[];
  historyRates?: object[];
  credentialRows?: EnabledCredentialSnapshotRow[];
  providerOverrides?: Record<string, unknown>;
  channelOverrides?: Record<string, unknown>;
}

function makeFixture(options: FixtureOptions = {}) {
  const currentModel = options.currentModel ?? modelDocument();
  const currentRate = options.currentRate ?? rateDocument();
  const current: CatalogRecord[] = [
    currentRecord(providerDocument(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    currentRecord(channelDocument(), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    currentRecord(currentModel, currentModel.revision === 1 ? MODEL_REVISION : TERMINAL_REVISION),
  ];
  if (options.includeCurrentRate !== false) {
    current.push(
      currentRecord(currentRate, currentRate.revision === 1 ? RATE_REVISION : TERMINAL_REVISION),
    );
  }
  const historyModels = options.historyModels ?? [revisionRow(currentModel, MODEL_REVISION)];
  const historyRates = options.historyRates ?? [revisionRow(currentRate, RATE_REVISION)];
  const providerSettings = [
    {
      provider_resource_uid: PROVIDER_UID,
      enabled: true,
      sort_order: 1,
      config_overrides: options.providerOverrides ?? { base_url: 'https://proxy.example/v1' },
    },
  ];
  const channelSettings = [
    {
      channel_resource_uid: CHANNEL_UID,
      enabled: true,
      priority: 2,
      config_overrides: options.channelOverrides ?? {},
    },
  ];
  const modelSettings = [
    {
      model_resource_uid: MODEL_UID,
      enabled: true,
      visibility: 'public',
      sort_order: 0,
    },
  ];
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ catalog_epoch: '7' }])
    .mockResolvedValueOnce(
      options.credentialRows ?? [
        {
          id: 'credential-a',
          channel_resource_uid: CHANNEL_UID,
          credential_type: 'api_key',
          payload_fields: ['api_key'],
        },
      ],
    )
    .mockResolvedValueOnce(historyModels)
    .mockResolvedValueOnce(historyRates);
  const manager = {
    query,
    getRepository: jest.fn((entity) => {
      if (entity === ProviderInstallation) {
        return { find: jest.fn(async () => providerSettings) };
      }
      if (entity === ChannelInstallation) {
        return { find: jest.fn(async () => channelSettings) };
      }
      if (entity === ModelSettings) {
        return { find: jest.fn(async () => modelSettings) };
      }
      throw new Error(`unexpected repository: ${String(entity)}`);
    }),
  };
  const catalog = { listCurrent: jest.fn(async () => current) };
  return { manager, catalog, current, providerSettings, channelSettings, modelSettings };
}

async function build(fixture: ReturnType<typeof makeFixture>, adapters: object) {
  return new RegistrySnapshotFactory(adapters as never, fixture.catalog as never).build(
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
  withRate = true,
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
    ...(withRate ? { rate_card_uid: RATE_UID } : {}),
  };
}

function rateDocument(
  lifecycle: CatalogRateCard['lifecycle'] = 'active',
  revision = 1,
  modelUid = MODEL_UID,
): CatalogRateCard {
  return {
    kind: 'rate_card',
    resource_uid: RATE_UID,
    revision,
    lifecycle,
    slug: 'example:model:default',
    model_uid: modelUid,
    pricing: {
      currency: 'USD',
      components: [{ meter: 'requests', per: 1, price: 0.01 }],
    },
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
