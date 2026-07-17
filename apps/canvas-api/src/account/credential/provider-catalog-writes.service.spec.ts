import type {
  CatalogChannelTemplate,
  CatalogModelOffering,
  CatalogProvider,
} from '@xgcanvas/model-catalog';
import type { CatalogRecord } from '../catalog';
import { ProviderCatalogWritesService } from './provider-catalog-writes.service';

const PROVIDER_UID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_A_UID = '22222222-2222-4222-8222-222222222222';
const CHANNEL_B_UID = '33333333-3333-4333-8333-333333333333';
const MODEL_UID = '44444444-4444-4444-8444-444444444444';

describe('ProviderCatalogWritesService credential preparation', () => {
  let provider: CatalogRecord<CatalogProvider>;
  let channels: CatalogRecord<CatalogChannelTemplate>[];
  let models: CatalogRecord<CatalogModelOffering>[];
  const manager = {};
  const catalog = {
    findCurrent: jest.fn(async (uid: string, kind: string) => {
      if (kind === 'provider' && uid === PROVIDER_UID) return provider;
      if (kind === 'model_offering') {
        return models.find((record) => record.document.resource_uid === uid) ?? null;
      }
      if (kind === 'channel_template') {
        return channels.find((record) => record.document.resource_uid === uid) ?? null;
      }
      return null;
    }),
    listCurrent: jest.fn(async (kind: string) => {
      if (kind === 'channel_template') return channels;
      if (kind === 'model_offering') return models;
      return [];
    }),
  };
  const writer = {
    patchProviderSettings: jest.fn(async () => ({})),
    patchChannelSettings: jest.fn(async () => ({})),
    patchModelSettings: jest.fn(async () => ({})),
    create: jest.fn(async (..._args: unknown[]) => ({})),
  };
  const registry = { mutateLocal: jest.fn(async (work) => work(manager)) };
  const service = new ProviderCatalogWritesService(
    catalog as never,
    writer as never,
    registry as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    provider = providerRecord(['openai-compat']);
    channels = [
      channelRecord(CHANNEL_A_UID, 'example-a'),
      channelRecord(CHANNEL_B_UID, 'example-b'),
    ];
    models = [modelRecord(MODEL_UID, [CHANNEL_B_UID], 'official')];
  });

  it('enables the Provider and only Channel resource UIDs allowed by selected official Models', async () => {
    await expect(
      service.prepareCredentialChannelInTransaction(manager as never, PROVIDER_UID, CHANNEL_B_UID, [
        MODEL_UID,
      ]),
    ).resolves.toMatchObject({
      channel_resource_uid: CHANNEL_B_UID,
      provider,
      channel: channels[1],
    });

    expect(writer.patchProviderSettings).toHaveBeenCalledWith(manager, PROVIDER_UID, {
      enabled: true,
    });
    expect(writer.patchChannelSettings).toHaveBeenCalledTimes(1);
    expect(writer.patchChannelSettings).toHaveBeenCalledWith(manager, CHANNEL_B_UID, {
      enabled: true,
    });
    expect(writer.create).not.toHaveBeenCalled();
  });

  it('rejects a selected resource that is not a current official Model of this Provider', async () => {
    models = [modelRecord(MODEL_UID, [CHANNEL_B_UID], 'local')];

    await expect(
      service.prepareCredentialChannelInTransaction(manager as never, PROVIDER_UID, CHANNEL_B_UID, [
        MODEL_UID,
      ]),
    ).rejects.toThrow('Selected official models are unavailable');
    expect(writer.patchChannelSettings).not.toHaveBeenCalled();
  });

  it('requires an explicit contract profile before importing vendor ids', async () => {
    await expect(
      service.importVendorModels(PROVIDER_UID, CHANNEL_A_UID, ['vendor-model']),
    ).rejects.toMatchObject({ response: { code: 'VENDOR_MODEL_CONTRACT_REQUIRED' } });
    expect(registry.mutateLocal).not.toHaveBeenCalled();
  });

  it('rejects the OpenAI text profile when the Provider does not declare that adapter', async () => {
    provider = providerRecord([]);

    await expect(
      service.importVendorModels(
        PROVIDER_UID,
        CHANNEL_A_UID,
        ['vendor-model'],
        'openai-text-chat-stream',
      ),
    ).rejects.toThrow('requires provider adapter openai-compat');
    expect(writer.create).not.toHaveBeenCalled();
  });

  it('uses the caller-selected compatible Channel even when the Provider has multiple Channels', async () => {
    await expect(
      service.prepareCredentialChannelInTransaction(
        manager as never,
        PROVIDER_UID,
        CHANNEL_B_UID,
        [],
        'openai-text-chat-stream',
        true,
      ),
    ).resolves.toMatchObject({
      channel_resource_uid: CHANNEL_B_UID,
      provider,
      channel: channels[1],
    });
    expect(writer.patchChannelSettings).toHaveBeenCalledWith(manager, CHANNEL_B_UID, {
      enabled: true,
    });
  });

  it('rejects a selected Model that is not allowed through the exact Channel', async () => {
    await expect(
      service.prepareCredentialChannelInTransaction(manager as never, PROVIDER_UID, CHANNEL_A_UID, [
        MODEL_UID,
      ]),
    ).rejects.toThrow('Selected official models are unavailable through the selected Channel');
  });

  it('imports a vendor id as a Local Model revision bound to the exact Channel UID', async () => {
    channels = [channelRecord(CHANNEL_A_UID, 'example-openai')];
    models = [];

    await expect(
      service.importVendorModels(
        PROVIDER_UID,
        CHANNEL_A_UID,
        ['vendor-chat'],
        'openai-text-chat-stream',
      ),
    ).resolves.toEqual({ created: ['vendor-chat'], skipped: [] });

    expect(writer.create).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        kind: 'model_offering',
        provider_uid: PROVIDER_UID,
        model_id: 'example:vendor-chat',
        provider_model_id: 'vendor-chat',
        adapter_key: 'openai-compat',
        allowed_channel_uids: [CHANNEL_A_UID],
      }),
      { settings: { enabled: true, visibility: 'public', sort_order: 0 } },
    );
  });
});

function providerRecord(adapterKeys: string[]): CatalogRecord<CatalogProvider> {
  return record(
    {
      kind: 'provider',
      resource_uid: PROVIDER_UID,
      revision: 1,
      lifecycle: 'active',
      slug: 'example',
      display_name: 'Example',
      auth_method: 'api_key',
      base_url: 'https://example.test/v1',
      auth_config: {},
      invocation_methods: ['http'],
      adapter_keys: adapterKeys,
      supported_regions: [],
    },
    'official',
  );
}

function channelRecord(uid: string, slug: string): CatalogRecord<CatalogChannelTemplate> {
  return record(
    {
      kind: 'channel_template',
      resource_uid: uid,
      revision: 1,
      lifecycle: 'active',
      slug,
      provider_uid: PROVIDER_UID,
      display_name: slug,
      invocation_method: 'http',
      adapter_keys: ['openai-compat'],
      base_url: 'https://example.test/v1',
      request_config: {},
    },
    'official',
  );
}

function modelRecord(
  uid: string,
  allowedChannelUids: string[],
  kind: 'official' | 'local',
): CatalogRecord<CatalogModelOffering> {
  return record(
    {
      kind: 'model_offering',
      resource_uid: uid,
      revision: 1,
      lifecycle: 'active',
      slug: 'example:preset',
      provider_uid: PROVIDER_UID,
      model_id: 'example:preset',
      provider_model_id: 'preset',
      display_name: 'Preset',
      task_types: ['gen.text'],
      capabilities: ['text_chat'],
      invocation_mode: 'sync',
      adapter_key: 'openai-compat',
      supports_streaming: false,
      allowed_channel_uids: allowedChannelUids,
      tags: [],
      param_schema: { version: '1.0', groups: [], properties: {}, required: [], defaults: {} },
      param_constraints: [],
      limits: {},
    },
    kind,
  );
}

function record<T extends CatalogProvider | CatalogChannelTemplate | CatalogModelOffering>(
  document: T,
  kind: 'official' | 'local',
): CatalogRecord<T> {
  return {
    document,
    origin: {
      kind,
      source_id: '55555555-5555-4555-8555-555555555555',
      resource_uid: document.resource_uid,
      revision: document.revision,
      revision_id: '66666666-6666-4666-8666-666666666666',
      release_id: kind === 'official' ? '77777777-7777-4777-8777-777777777777' : null,
    },
  };
}
