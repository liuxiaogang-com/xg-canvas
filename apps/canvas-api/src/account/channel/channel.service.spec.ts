import type { CatalogChannelTemplate, CatalogProvider } from '@xgcanvas/model-catalog';
import { CatalogResource, type CatalogRecord } from '../catalog';
import { ProviderInstallation } from '../provider/provider-installation.entity';
import { ChannelService } from './channel.service';
import { ChannelInstallation } from './channel-installation.entity';

const CHANNEL_UID = '11111111-1111-4111-8111-111111111111';
const PROVIDER_UID = '22222222-2222-4222-8222-222222222222';

describe('ChannelService retirement', () => {
  const record = channelRecord();
  const resourceRepo = {
    findOneByOrFail: jest.fn(async () => ({ resource_uid: CHANNEL_UID, head_revision: 2 })),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === CatalogResource) return resourceRepo;
      throw new Error(`unexpected repository ${String(entity)}`);
    }),
  };
  const writer = {
    retire: jest.fn(async () => ({})),
    patchChannelSettings: jest.fn(async () => ({})),
  };
  const catalog = {
    findCurrent: jest.fn(async () => record),
    listCurrent: jest.fn(async (): Promise<unknown[]> => []),
  };
  const registry = { mutateLocal: jest.fn(async (work) => work(manager)) };
  const outboundRoutes = { assertCredentialRouteChangeAllowed: jest.fn() };
  const service = new ChannelService(
    {} as never,
    writer as never,
    catalog as never,
    registry as never,
    outboundRoutes as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    catalog.findCurrent.mockResolvedValue(record);
    catalog.listCurrent.mockResolvedValue([]);
  });

  it('retires the Local Catalog resource and disables only its runtime installation', async () => {
    await service.remove(CHANNEL_UID);

    expect(catalog.findCurrent).toHaveBeenCalledWith(CHANNEL_UID, 'channel_template', manager);
    expect(writer.retire).toHaveBeenCalledWith(manager, CHANNEL_UID, 2);
    expect(writer.patchChannelSettings).toHaveBeenCalledWith(manager, CHANNEL_UID, {
      enabled: false,
    });
  });

  it('does not retire a Channel still referenced by a current Model revision', async () => {
    catalog.listCurrent.mockResolvedValue([
      {
        document: {
          kind: 'model_offering',
          lifecycle: 'active',
          allowed_channel_uids: [CHANNEL_UID],
        },
      },
    ]);

    await expect(service.remove(CHANNEL_UID)).rejects.toMatchObject({
      response: { code: 'CATALOG_RESOURCE_IN_USE' },
    });
    expect(writer.retire).not.toHaveBeenCalled();
  });
});

describe('ChannelService outbound route updates', () => {
  const userId = '99999999-9999-4999-8999-999999999999';
  const channelSettings = {
    channel_resource_uid: CHANNEL_UID,
    enabled: true,
    priority: 0,
    config_overrides: {} as Record<string, unknown>,
  };
  const providerSettings = {
    provider_resource_uid: PROVIDER_UID,
    enabled: true,
    config_overrides: {},
  };
  const channelSettingsRepo = {
    findOneByOrFail: jest.fn(async () => channelSettings),
  };
  const providerSettingsRepo = {
    findOneByOrFail: jest.fn(async () => providerSettings),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === ChannelInstallation) return channelSettingsRepo;
      if (entity === ProviderInstallation) return providerSettingsRepo;
      throw new Error(`unexpected repository ${String(entity)}`);
    }),
  };
  const settingsRepo = { findOneBy: jest.fn(async () => channelSettings) };
  const writer = {
    append: jest.fn(),
    patchChannelSettings: jest.fn(async (_manager, _uid, patch) => {
      channelSettings.config_overrides = {
        ...channelSettings.config_overrides,
        ...(patch.config_overrides ?? {}),
      };
    }),
  };
  const catalog = {
    findCurrent: jest.fn(async (_uid, kind) =>
      kind === 'provider' ? providerRecord() : channelRecord(),
    ),
  };
  const registry = { mutateLocal: jest.fn(async (work) => work(manager)) };
  const outboundRoutes = { assertCredentialRouteChangeAllowed: jest.fn(async () => undefined) };
  const service = new ChannelService(
    settingsRepo as never,
    writer as never,
    catalog as never,
    registry as never,
    outboundRoutes as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    channelSettings.config_overrides = {};
    outboundRoutes.assertCredentialRouteChangeAllowed.mockResolvedValue(undefined);
  });

  it('checks the effective origin before persisting a Channel override', async () => {
    await expect(
      service.update(CHANNEL_UID, { base_url: 'https://gateway.example/v1' }, userId),
    ).resolves.toMatchObject({ base_url: 'https://gateway.example/v1' });

    expect(outboundRoutes.assertCredentialRouteChangeAllowed).toHaveBeenCalledWith(
      manager,
      userId,
      [
        {
          channel_resource_uid: CHANNEL_UID,
          current_base_url: 'https://vendor.example/v1',
          next_base_url: 'https://gateway.example/v1',
        },
      ],
    );
  });

  it('does not persist a Channel redirect rejected by route policy', async () => {
    outboundRoutes.assertCredentialRouteChangeAllowed.mockRejectedValueOnce({
      response: { code: 'CREDENTIAL_ROUTE_CHANGE_FORBIDDEN' },
    });

    await expect(
      service.update(CHANNEL_UID, { base_url: 'https://attacker.example/v1' }, userId),
    ).rejects.toMatchObject({ response: { code: 'CREDENTIAL_ROUTE_CHANGE_FORBIDDEN' } });
    expect(writer.patchChannelSettings).not.toHaveBeenCalled();
  });
});

function channelRecord(): CatalogRecord<CatalogChannelTemplate> {
  return {
    document: {
      kind: 'channel_template',
      resource_uid: CHANNEL_UID,
      revision: 2,
      lifecycle: 'active',
      slug: 'example-default',
      provider_uid: PROVIDER_UID,
      display_name: 'Example Default',
      invocation_method: 'http',
      adapter_keys: ['openai-compat'],
      request_config: {},
    },
    origin: {
      kind: 'local',
      source_id: '33333333-3333-4333-8333-333333333333',
      resource_uid: CHANNEL_UID,
      revision: 2,
      revision_id: '44444444-4444-4444-8444-444444444444',
      release_id: null,
    },
  };
}

function providerRecord(): CatalogRecord<CatalogProvider> {
  return {
    document: {
      kind: 'provider',
      resource_uid: PROVIDER_UID,
      revision: 1,
      lifecycle: 'active',
      slug: 'example',
      display_name: 'Example',
      auth_method: 'api_key',
      auth_config: {},
      base_url: 'https://vendor.example/v1',
      invocation_methods: ['http'],
      adapter_keys: ['openai-compat'],
      supported_regions: [],
    },
    origin: {
      kind: 'local',
      source_id: '33333333-3333-4333-8333-333333333333',
      resource_uid: PROVIDER_UID,
      revision: 1,
      revision_id: '77777777-7777-4777-8777-777777777777',
      release_id: null,
    },
  };
}
