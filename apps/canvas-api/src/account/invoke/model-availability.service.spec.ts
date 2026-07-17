import { AdapterError } from '@xgcanvas/adapters-contract';
import { ModelAvailabilityService } from './model-availability.service';

const MODEL_UID = '11111111-1111-4111-8111-111111111111';
const PROVIDER_UID = '22222222-2222-4222-8222-222222222222';
const CHANNEL_UID = '33333333-3333-4333-8333-333333333333';
const PIN = {
  model_resource_uid: MODEL_UID,
  model_revision_id: '44444444-4444-4444-8444-444444444444',
  rate_card_revision_id: null,
  catalog_epoch: '1',
};

describe('ModelAvailabilityService', () => {
  const entry = {
    manifest: {
      id: 'example:model',
      enabled: true,
      task_types: ['gen.text'],
      adapter_key: 'openai-compat',
    },
    pin: PIN,
    provider_resource_uid: PROVIDER_UID,
    allowed_channel_resource_uids: [CHANNEL_UID],
  };
  const provider = {
    enabled: true,
    document: { resource_uid: PROVIDER_UID, lifecycle: 'active' },
  };
  const registry = {
    requireEntry: jest.fn(() => entry),
    resolveEntryTaskPin: jest.fn((value) => ({ ...value.pin })),
    getProvider: jest.fn((): typeof provider | null => provider),
    getSnapshot: jest.fn(() => ({
      channelsByResourceUid: new Map([[CHANNEL_UID, liveChannel(CHANNEL_UID)]]),
    })),
  };
  const service = new ModelAvailabilityService(registry as never);

  beforeEach(() => {
    jest.clearAllMocks();
    registry.requireEntry.mockReturnValue(entry);
    registry.resolveEntryTaskPin.mockImplementation((value) => ({ ...value.pin }));
    registry.getProvider.mockReturnValue(provider);
    registry.getSnapshot.mockReturnValue({
      channelsByResourceUid: new Map([[CHANNEL_UID, liveChannel(CHANNEL_UID)]]),
    });
  });

  it('returns the canonical model id and immutable pin after exact-route checks', async () => {
    await expect(service.requireCurrent('example:model', 'gen.text')).resolves.toEqual({
      model_id: 'example:model',
      pin: PIN,
    });
    expect(registry.requireEntry).toHaveBeenCalledWith('example:model', expect.any(Object));
    expect(registry.resolveEntryTaskPin).toHaveBeenCalledWith(entry, 'gen.text');
    expect(registry.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('requires an enabled credential on an allowed Channel resource UID', async () => {
    registry.getSnapshot.mockReturnValue({
      channelsByResourceUid: new Map([[CHANNEL_UID, liveChannel(CHANNEL_UID, [])]]),
    });

    await expect(service.requireCurrent('example:model', 'gen.text')).rejects.toMatchObject({
      code: 'CREDENTIAL_INVALID',
    });
  });

  it('does not accept an enabled credential attached to a different Channel resource', async () => {
    const otherUid = '55555555-5555-4555-8555-555555555555';
    registry.getSnapshot.mockReturnValue({
      channelsByResourceUid: new Map([[otherUid, liveChannel(otherUid)]]),
    });

    await expect(service.availableIds(['example:model'])).resolves.toEqual(new Set());
  });

  it('rejects an otherwise valid model when the Provider is disabled', async () => {
    registry.getProvider.mockReturnValue({ ...provider, enabled: false });

    await expect(service.requireCurrent('example:model', 'gen.text')).rejects.toMatchObject({
      code: 'CHANNEL_UNAVAILABLE',
    });
  });

  it('does not hide unexpected registry failures as unavailability', async () => {
    registry.getSnapshot.mockImplementation(() => {
      throw new Error('registry unavailable');
    });

    await expect(service.availableIds(['example:model'])).rejects.toThrow('registry unavailable');
  });

  it('maps expected model resolution errors to false', async () => {
    registry.resolveEntryTaskPin.mockImplementation(() => {
      throw new AdapterError({ code: 'MODEL_DISABLED', message: 'disabled' });
    });

    await expect(service.isCurrentAvailable('example:model')).resolves.toBe(false);
  });
});

function liveChannel(resourceUid: string, credentialIds = ['credential-a']) {
  return {
    enabled: true,
    enabled_credential_ids: credentialIds,
    document: {
      resource_uid: resourceUid,
      provider_uid: PROVIDER_UID,
      lifecycle: 'active',
      adapter_keys: ['openai-compat'],
    },
  };
}
