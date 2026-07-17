import { ProviderModelsService } from './provider-models.service';

jest.mock('../../common/http/guarded-outbound', () => ({
  guardedFetch: (input: string | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

const PROVIDER_UID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_UID = '22222222-2222-4222-8222-222222222222';
const OTHER_CHANNEL_UID = '33333333-3333-4333-8333-333333333333';

describe('ProviderModelsService vendor model flow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses one explicit Channel credential context and marks current Catalog imports', async () => {
    const credentials = {
      resolveProviderApiContext: jest.fn(async () => ({
        base: 'https://example.test/compatible/v1',
        apiKey: 'secret',
      })),
    };
    const catalog = {
      listCurrent: jest.fn(async () => [
        {
          document: {
            provider_uid: PROVIDER_UID,
            provider_model_id: 'already-imported',
          },
        },
      ]),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'already-imported' }, { id: 'vendor-chat' }],
        }),
        { status: 200 },
      ),
    );
    const service = makeService({ credentials, catalog });

    await expect(service.listVendorModels(PROVIDER_UID, CHANNEL_UID)).resolves.toEqual({
      models: [
        { id: 'already-imported', imported: true },
        { id: 'vendor-chat', imported: false },
      ],
    });
    expect(credentials.resolveProviderApiContext).toHaveBeenCalledWith(PROVIDER_UID, [CHANNEL_UID]);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/compatible/v1/models',
      expect.objectContaining({ headers: { authorization: 'Bearer secret' } }),
    );
  });

  it('forwards imports with an explicit contract profile and Channel resource UID', async () => {
    const writes = {
      importVendorModels: jest.fn(async () => ({ created: ['vendor-chat'], skipped: [] })),
    };
    const service = makeService({ writes });

    await expect(
      service.importModels(PROVIDER_UID, CHANNEL_UID, ['vendor-chat'], 'openai-text-chat-stream'),
    ).resolves.toEqual({ created: ['vendor-chat'], skipped: [] });
    expect(writes.importVendorModels).toHaveBeenCalledWith(
      PROVIDER_UID,
      CHANNEL_UID,
      ['vendor-chat'],
      'openai-text-chat-stream',
    );
  });

  it('persists Channel enablement, Credential, import and preset enablement in one mutation', async () => {
    const manager = {
      getRepository: jest.fn(() => ({
        create: jest.fn((value) => ({
          id: '44444444-4444-4444-8444-444444444444',
          label: null,
          payload_fields: [],
          enabled: true,
          archived_at: null,
          is_valid: true,
          last_validated_at: null,
          validation_error: null,
          expires_at: null,
          last_used_at: null,
          total_usage_count: '0',
          created_by: null,
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
          ...value,
        })),
        save: jest.fn(async (value) => value),
      })),
    };
    const bootstrap = { mutateLocal: jest.fn((work) => work(manager)) };
    const writes = {
      prepareCredentialChannelInTransaction: jest.fn(async () => ({
        channel_resource_uid: CHANNEL_UID,
        provider: registryFixture().getProvider(PROVIDER_UID),
        channel: registryFixture().getChannel(CHANNEL_UID),
      })),
      importVendorModelsInTransaction: jest.fn(async () => ({
        created: ['vendor-chat'],
        skipped: [],
      })),
      enableOfficialModelsInTransaction: jest.fn(async () => 1),
    };
    const encryption = {
      encrypt: jest.fn(async () => ({ encrypted: Buffer.from('encrypted'), keyId: 'v1' })),
    };
    const service = makeService({ bootstrap, writes, encryption });

    await expect(
      service.addCredentialWithModels({
        provider_resource_uid: PROVIDER_UID,
        channel_resource_uid: CHANNEL_UID,
        payload: { api_key: 'secret' },
        vendor_model_ids: ['vendor-chat'],
        vendor_model_profile: 'openai-text-chat-stream',
        preset_model_resource_uids: ['55555555-5555-4555-8555-555555555555'],
      }),
    ).resolves.toMatchObject({
      credential: { channel_resource_uid: CHANNEL_UID, credential_type: 'api_key' },
      imported: { created: ['vendor-chat'], skipped: [] },
      enabledPresets: 1,
    });
    expect(bootstrap.mutateLocal).toHaveBeenCalledTimes(1);
    expect(writes.prepareCredentialChannelInTransaction).toHaveBeenCalledWith(
      manager,
      PROVIDER_UID,
      CHANNEL_UID,
      ['55555555-5555-4555-8555-555555555555'],
      'openai-text-chat-stream',
      true,
    );
    expect(writes.importVendorModelsInTransaction).toHaveBeenCalledWith(
      manager,
      PROVIDER_UID,
      CHANNEL_UID,
      ['vendor-chat'],
      'openai-text-chat-stream',
    );
  });

  it('validates the payload against the Provider re-read inside the mutation', async () => {
    const manager = { getRepository: jest.fn() };
    const bootstrap = { mutateLocal: jest.fn((work) => work(manager)) };
    const writes = {
      prepareCredentialChannelInTransaction: jest.fn(async () => ({
        channel_resource_uid: CHANNEL_UID,
        provider: {
          document: { auth_method: 'cli_login' },
        },
        channel: { document: { resource_uid: CHANNEL_UID } },
      })),
    };
    const encryption = { encrypt: jest.fn() };
    const service = makeService({ bootstrap, writes, encryption });

    await expect(
      service.addCredentialWithModels({
        provider_resource_uid: PROVIDER_UID,
        channel_resource_uid: CHANNEL_UID,
        payload: { api_key: 'stale-snapshot-key' },
      }),
    ).rejects.toThrow('empty cli_session credential marker');
    expect(bootstrap.mutateLocal).toHaveBeenCalledTimes(1);
    expect(encryption.encrypt).not.toHaveBeenCalled();
    expect(manager.getRepository).not.toHaveBeenCalled();
  });

  it('rejects a Channel that does not belong to the selected Provider', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = makeService({
      registry: registryFixture({ channelProviderUid: '99999999-9999-4999-8999-999999999999' }),
    });

    await expect(service.probeModels(PROVIDER_UID, OTHER_CHANNEL_UID, 'secret')).rejects.toThrow(
      'not found for Provider',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed before parsing a declared oversized vendor response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-length': '1000001' },
      }),
    );
    const service = makeService();

    await expect(service.probeModels(PROVIDER_UID, CHANNEL_UID, 'secret')).resolves.toEqual({
      models: [],
      note: '厂商模型列表响应过大',
    });
  });

  it('omits vendor ids that cannot fit the canonical Provider-prefixed model id', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'valid-model' }, { id: 'x'.repeat(193) }] }), {
          status: 200,
        }),
      );
    const service = makeService();

    await expect(service.probeModels(PROVIDER_UID, CHANNEL_UID, 'secret')).resolves.toEqual({
      models: [{ id: 'valid-model', imported: false }],
      note: '已忽略 1 个超过本项目模型标识长度限制的厂商模型',
    });
  });
});

function makeService(overrides: Record<string, unknown> = {}): ProviderModelsService {
  const credentials = overrides.credentials ?? {
    resolveProviderApiContext: jest.fn(async () => null),
  };
  const catalog = overrides.catalog ?? { listCurrent: jest.fn(async () => []) };
  const registry = overrides.registry ?? registryFixture();
  const bootstrap = overrides.bootstrap ?? { mutateLocal: jest.fn() };
  const writes = overrides.writes ?? {};
  const encryption = overrides.encryption ?? {
    encrypt: jest.fn(async () => ({ encrypted: Buffer.from('encrypted'), keyId: 'v1' })),
  };
  return new ProviderModelsService(
    credentials as never,
    catalog as never,
    registry as never,
    bootstrap as never,
    writes as never,
    encryption as never,
  );
}

function registryFixture(options: { channelProviderUid?: string } = {}) {
  const provider = {
    document: {
      resource_uid: PROVIDER_UID,
      slug: 'example',
      lifecycle: 'active',
      auth_method: 'api_key',
      adapter_keys: ['openai-compat'],
      base_url: 'https://example.test/compatible/v1',
    },
    config_overrides: {},
  };
  const channel = {
    document: {
      resource_uid: CHANNEL_UID,
      provider_uid: options.channelProviderUid ?? PROVIDER_UID,
      lifecycle: 'active',
      adapter_keys: ['openai-compat'],
      base_url: 'https://example.test/compatible/v1',
    },
    config_overrides: {},
  };
  return {
    getProvider: jest.fn((uid: string) => (uid === PROVIDER_UID ? provider : null)),
    getChannel: jest.fn((uid: string) =>
      uid === CHANNEL_UID || uid === OTHER_CHANNEL_UID ? channel : null,
    ),
  };
}
