import { ChannelResolverService } from './channel-resolver.service';

const PROVIDER_UID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_UID = '22222222-2222-4222-8222-222222222222';
const CHANNEL_REVISION_ID = '33333333-3333-4333-8333-333333333333';
const ROUTE = { key: 'frozen-route', base_url: 'https://frozen.example/v1', options: { v: 1 } };

describe('ChannelResolverService historical routing', () => {
  const provider = {
    enabled: false,
    config_overrides: {},
    document: {
      resource_uid: PROVIDER_UID,
      lifecycle: 'retired',
      base_url: 'https://provider.example/v1',
    },
  };
  const channel = {
    enabled: false,
    priority: 1,
    config_overrides: {},
    document: {
      resource_uid: CHANNEL_UID,
      provider_uid: PROVIDER_UID,
      lifecycle: 'retired',
      slug: 'archived-route',
      adapter_keys: ['test-adapter'],
      request_config: {},
    },
  };
  const registry = {
    getSnapshot: jest.fn(() => ({})),
    getChannel: jest.fn(() => channel),
    getProvider: jest.fn(() => provider),
  };
  const catalog = {
    findRevision: jest.fn().mockResolvedValue({
      document: {
        kind: 'channel_template',
        resource_uid: CHANNEL_UID,
        provider_uid: PROVIDER_UID,
        lifecycle: 'active',
        adapter_keys: ['test-adapter'],
      },
    }),
  };
  const service = new ChannelResolverService(registry as never, catalog as never);

  beforeEach(() => jest.clearAllMocks());

  it('keeps an exact dispatched route usable after runtime disable or Catalog retirement', async () => {
    await expect(
      service.getHistoricalRoute(selection([CHANNEL_UID]), CHANNEL_UID, CHANNEL_REVISION_ID, ROUTE),
    ).resolves.toMatchObject({
      resource_uid: CHANNEL_UID,
      revision_id: CHANNEL_REVISION_ID,
      slug: 'frozen-route',
      base_url: 'https://frozen.example/v1',
    });
  });

  it('still rejects a route outside the pinned Model revision', async () => {
    await expect(
      service.getHistoricalRoute(selection([]), CHANNEL_UID, CHANNEL_REVISION_ID, ROUTE),
    ).rejects.toMatchObject({ code: 'CHANNEL_UNAVAILABLE' });
    await expect(
      service.getHistoricalRoute(
        selection(['33333333-3333-4333-8333-333333333333']),
        CHANNEL_UID,
        CHANNEL_REVISION_ID,
        ROUTE,
      ),
    ).rejects.toMatchObject({ code: 'CHANNEL_UNAVAILABLE' });
  });

  it('blocks a resource whose current lifecycle was revoked', async () => {
    channel.document.lifecycle = 'revoked';
    await expect(
      service.getHistoricalRoute(selection([CHANNEL_UID]), CHANNEL_UID, CHANNEL_REVISION_ID, ROUTE),
    ).rejects.toMatchObject({ code: 'CHANNEL_UNAVAILABLE' });
    channel.document.lifecycle = 'retired';
  });
});

function selection(allowed: string[]) {
  return {
    model_id: 'example:model',
    model_resource_uid: '44444444-4444-4444-8444-444444444444',
    model_revision_id: '55555555-5555-4555-8555-555555555555',
    provider_resource_uid: PROVIDER_UID,
    adapter_key: 'test-adapter',
    allowed_channel_resource_uids: allowed,
    historical: true,
  };
}
