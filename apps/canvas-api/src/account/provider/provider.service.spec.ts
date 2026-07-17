import type { CatalogChannelTemplate, CatalogProvider } from '@xgcanvas/model-catalog';
import type { CatalogRecord } from '../catalog';
import { ChannelInstallation } from '../channel/channel-installation.entity';
import { ProviderService } from './provider.service';
import { ProviderInstallation } from './provider-installation.entity';

const PROVIDER_UID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_UID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '66666666-6666-4666-8666-666666666666';

describe('ProviderService runtime settings', () => {
  const settings = {
    provider_resource_uid: PROVIDER_UID,
    enabled: true,
    sort_order: 0,
    config_overrides: {},
  };
  const record = providerRecord();
  const settingsRepo = {
    findOneBy: jest.fn(async () => settings),
  };
  const writer = {
    patchProviderSettings: jest.fn(async (_manager, _uid, patch) => {
      settings.config_overrides = {
        ...settings.config_overrides,
        ...(patch.config_overrides ?? {}),
      };
      for (const key of patch.clear_config_overrides ?? []) {
        delete (settings.config_overrides as Record<string, unknown>)[key];
      }
    }),
    append: jest.fn(),
  };
  const providerSettingsRepo = { findOneByOrFail: jest.fn(async () => settings) };
  const channelSettingsRepo = {
    find: jest.fn(async () => [{ channel_resource_uid: CHANNEL_UID, config_overrides: {} }]),
  };
  const catalog = {
    findCurrent: jest.fn(async () => record),
    listCurrent: jest.fn(async () => [channelRecord()]),
  };
  const manager = {
    query: jest.fn(async () => [{ present: false }]),
    getRepository: jest.fn((entity) => {
      if (entity === ProviderInstallation) return providerSettingsRepo;
      if (entity === ChannelInstallation) return channelSettingsRepo;
      throw new Error(`unexpected repository ${String(entity)}`);
    }),
  };
  const registry = { mutateLocal: jest.fn(async (work) => work(manager)) };
  const outboundRoutes = { assertCredentialRouteChangeAllowed: jest.fn(async () => undefined) };
  const service = new ProviderService(
    settingsRepo as never,
    writer as never,
    catalog as never,
    registry as never,
    outboundRoutes as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    settings.config_overrides = {};
    catalog.findCurrent.mockResolvedValue(record);
    catalog.listCurrent.mockResolvedValue([channelRecord()]);
    outboundRoutes.assertCredentialRouteChangeAllowed.mockResolvedValue(undefined);
    manager.query.mockResolvedValue([{ present: false }]);
  });

  it('stores an official endpoint override in ProviderInstallation without revising Catalog', async () => {
    await expect(
      service.update(
        PROVIDER_UID,
        {
          base_url: 'https://proxy.example/v1',
        },
        USER_ID,
      ),
    ).resolves.toMatchObject({
      resource_uid: PROVIDER_UID,
      base_url: 'https://proxy.example/v1',
    });

    expect(writer.append).not.toHaveBeenCalled();
    expect(outboundRoutes.assertCredentialRouteChangeAllowed).toHaveBeenCalledWith(
      manager,
      USER_ID,
      [
        {
          channel_resource_uid: CHANNEL_UID,
          current_base_url: 'https://official.example/v1',
          next_base_url: 'https://proxy.example/v1',
        },
      ],
    );
    expect(writer.patchProviderSettings).toHaveBeenCalledWith(manager, PROVIDER_UID, {
      config_overrides: { base_url: 'https://proxy.example/v1' },
      clear_config_overrides: [],
    });
  });

  it('clears a runtime override and exposes the current Catalog default again', async () => {
    settings.config_overrides = { base_url: 'https://proxy.example/v1' };

    await expect(
      service.update(
        PROVIDER_UID,
        {
          reset_config_overrides: ['base_url'],
        },
        USER_ID,
      ),
    ).resolves.toMatchObject({ base_url: 'https://official.example/v1' });

    expect(writer.patchProviderSettings).toHaveBeenCalledWith(manager, PROVIDER_UID, {
      clear_config_overrides: ['base_url'],
    });
  });

  it('rejects structural edits to an official Catalog Provider', async () => {
    await expect(
      service.update(PROVIDER_UID, { display_name: 'Changed' }, USER_ID),
    ).rejects.toMatchObject({
      response: { code: 'CATALOG_RESOURCE_READ_ONLY' },
    });
    expect(writer.append).not.toHaveBeenCalled();
    expect(writer.patchProviderSettings).not.toHaveBeenCalled();
  });

  it('does not persist an origin change rejected by the credential route policy', async () => {
    outboundRoutes.assertCredentialRouteChangeAllowed.mockRejectedValueOnce({
      response: { code: 'CREDENTIAL_ROUTE_CHANGE_FORBIDDEN' },
    });

    await expect(
      service.update(PROVIDER_UID, { base_url: 'https://attacker.example/v1' }, USER_ID),
    ).rejects.toMatchObject({ response: { code: 'CREDENTIAL_ROUTE_CHANGE_FORBIDDEN' } });
    expect(writer.patchProviderSettings).not.toHaveBeenCalled();
  });

  it('rejects changing a local Provider auth method while credentials still exist', async () => {
    const local = providerRecord();
    local.origin = { ...local.origin, kind: 'local', release_id: null };
    catalog.findCurrent.mockResolvedValueOnce(local);
    manager.query.mockResolvedValueOnce([{ present: true }]);

    await expect(
      service.update(PROVIDER_UID, { expected_revision: 1, auth_method: 'cli_login' }, USER_ID),
    ).rejects.toMatchObject({
      response: { code: 'CATALOG_CREDENTIAL_AUTH_CONFLICT' },
    });

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('account.credentials'), [
      [CHANNEL_UID],
    ]);
    expect(writer.append).not.toHaveBeenCalled();
  });
});

function providerRecord(): CatalogRecord<CatalogProvider> {
  return {
    document: {
      kind: 'provider',
      resource_uid: PROVIDER_UID,
      revision: 1,
      lifecycle: 'active',
      slug: 'example',
      display_name: 'Example',
      base_url: 'https://official.example/v1',
      auth_method: 'api_key',
      auth_config: {},
      invocation_methods: ['http'],
      adapter_keys: ['openai-compat'],
      supported_regions: [],
    },
    origin: {
      kind: 'official',
      source_id: '22222222-2222-4222-8222-222222222222',
      resource_uid: PROVIDER_UID,
      revision: 1,
      revision_id: '33333333-3333-4333-8333-333333333333',
      release_id: '44444444-4444-4444-8444-444444444444',
    },
  };
}

function channelRecord(): CatalogRecord<CatalogChannelTemplate> {
  return {
    document: {
      kind: 'channel_template',
      resource_uid: CHANNEL_UID,
      revision: 1,
      lifecycle: 'active',
      slug: 'example-default',
      provider_uid: PROVIDER_UID,
      display_name: 'Example Default',
      invocation_method: 'http',
      adapter_keys: ['openai-compat'],
      request_config: {},
    },
    origin: {
      kind: 'official',
      source_id: '77777777-7777-4777-8777-777777777777',
      resource_uid: CHANNEL_UID,
      revision: 1,
      revision_id: '88888888-8888-4888-8888-888888888888',
      release_id: '44444444-4444-4444-8444-444444444444',
    },
  };
}
