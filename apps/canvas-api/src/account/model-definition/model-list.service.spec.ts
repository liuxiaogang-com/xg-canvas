import { ModelListService } from './model-list.service';

const MODEL_UID = '11111111-1111-4111-8111-111111111111';
const MODEL_REVISION = '22222222-2222-4222-8222-222222222222';
const PROVIDER_UID = '33333333-3333-4333-8333-333333333333';
const RATE_REVISION = '44444444-4444-4444-8444-444444444444';

describe('ModelListService Catalog projection', () => {
  const entry = {
    manifest: {
      id: 'example:model',
      display_name: 'Example Model',
      enabled: true,
      visibility: 'public',
      task_types: ['gen.text'],
      capabilities: ['text_chat'],
      invocation_mode: 'sync',
      input_contract: undefined,
    },
    document: {
      description: 'Current Catalog revision',
      supports_streaming: false,
      tags: ['chat'],
      lifecycle: 'active',
    },
    pin: {
      model_resource_uid: MODEL_UID,
      model_revision_id: MODEL_REVISION,
      rate_card_revision_id: RATE_REVISION,
      catalog_epoch: '12',
    },
    provider_resource_uid: PROVIDER_UID,
  };
  const provider = {
    document: {
      slug: 'example',
      display_name: 'Example',
      icon_url: 'https://example.test/icon.svg',
    },
  };
  const snapshot = {
    byId: new Map([['example:model', entry]]),
    providersByResourceUid: new Map([[PROVIDER_UID, provider]]),
    rateCardsByRevisionId: new Map([
      [
        RATE_REVISION,
        {
          pricing: {
            currency: 'USD',
            components: [{ meter: 'requests', per: 1, price: 0.01 }],
          },
        },
      ],
    ]),
  };
  const registry = {
    getSnapshot: jest.fn(() => snapshot),
    getProvider: jest.fn(() => provider),
    getRateCardRevision: jest.fn(() => ({
      pricing: {
        currency: 'USD',
        components: [{ meter: 'requests', per: 1, price: 0.01 }],
      },
    })),
    getEntry: jest.fn(() => entry),
  };
  const availability = {
    availableIds: jest.fn(async () => new Set(['example:model'])),
    isCurrentAvailable: jest.fn(async () => true),
  };
  const definitions = { findOne: jest.fn(async () => ({ model_id: 'example:model' })) };
  const service = new ModelListService(
    registry as never,
    availability as never,
    definitions as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    registry.getSnapshot.mockReturnValue(snapshot);
    registry.getProvider.mockReturnValue(provider);
    registry.getEntry.mockReturnValue(entry);
    availability.availableIds.mockResolvedValue(new Set(['example:model']));
    availability.isCurrentAvailable.mockResolvedValue(true);
  });

  it('lists only available public entries and exposes exact revision identity', async () => {
    await expect(service.getAvailableModels({ taskType: 'gen.text' })).resolves.toEqual([
      expect.objectContaining({
        model_id: 'example:model',
        model_resource_uid: MODEL_UID,
        model_revision_id: MODEL_REVISION,
        catalog_epoch: '12',
        provider: {
          slug: 'example',
          display_name: 'Example',
          icon_url: 'https://example.test/icon.svg',
        },
      }),
    ]);

    expect(availability.availableIds).toHaveBeenCalledWith(
      ['example:model'],
      'gen.text',
      snapshot,
    );
    expect(registry.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('loads detail by Model resource UID through unified availability', async () => {
    await expect(service.getModelDetail('example:model')).resolves.toEqual({
      model_id: 'example:model',
      catalog_epoch: '12',
    });
    expect(availability.isCurrentAvailable).toHaveBeenCalledWith(
      'example:model',
      undefined,
      snapshot,
    );
    expect(definitions.findOne).toHaveBeenCalledWith(MODEL_UID);
  });

  it('does not expose a Model rejected by the unified availability service', async () => {
    availability.availableIds.mockResolvedValue(new Set());
    await expect(service.getAvailableModels({})).resolves.toEqual([]);
  });
});
