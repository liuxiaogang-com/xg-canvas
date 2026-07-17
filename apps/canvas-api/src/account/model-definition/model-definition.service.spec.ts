import { BadRequestException } from '@nestjs/common';
import type {
  CatalogChannelTemplate,
  CatalogModelOffering,
  CatalogProvider,
  CatalogRateCard,
} from '@xgcanvas/model-catalog';
import type { CatalogRecord } from '../catalog';
import { ModelDefinitionService } from './model-definition.service';

const PROVIDER_UID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_UID = '22222222-2222-4222-8222-222222222222';
const OTHER_PROVIDER_UID = '33333333-3333-4333-8333-333333333333';
const MODEL_UID = '77777777-7777-4777-8777-777777777777';
const RATE_UID = '88888888-8888-4888-8888-888888888888';

describe('ModelDefinitionService Catalog write boundary', () => {
  let storedModel: CatalogModelOffering | null;
  let storedRate: CatalogRateCard | null;
  let currentChannel: CatalogRecord<CatalogChannelTemplate> | null;
  const provider = providerRecord();
  const settingsRepo = {
    findOneBy: jest.fn(async ({ model_resource_uid: resourceUid }) => ({
      model_resource_uid: resourceUid,
      enabled: false,
      visibility: 'public',
      sort_order: 0,
    })),
  };
  const catalog = {
    listCurrent: jest.fn(async () => []),
    findCurrent: jest.fn(async (uid: string, kind: string) => {
      if (kind === 'provider' && uid === PROVIDER_UID) return provider;
      if (kind === 'channel_template' && uid === CHANNEL_UID) return currentChannel;
      if (kind === 'model_offering' && storedModel?.resource_uid === uid) {
        return record(storedModel, 'local');
      }
      if (kind === 'rate_card' && storedRate?.resource_uid === uid) {
        return record(storedRate, 'local');
      }
      return null;
    }),
  };
  const writer = {
    create: jest.fn(async (_manager, document: CatalogModelOffering) => {
      if (document.kind === 'model_offering') storedModel = document;
      return {};
    }),
    append: jest.fn(async (_manager, _uid, _expectedRevision, document) => {
      if (document.kind === 'model_offering') storedModel = document;
      if (document.kind === 'rate_card') storedRate = document;
      return {};
    }),
    retire: jest.fn(async (_manager, uid: string, expectedRevision: number) => {
      if (storedRate?.resource_uid === uid) {
        storedRate = {
          ...storedRate,
          revision: expectedRevision + 1,
          lifecycle: 'retired',
        };
      }
      return {};
    }),
    patchModelSettings: jest.fn(async () => ({})),
  };
  const manager = {};
  const registry = { mutateLocal: jest.fn(async (callback) => callback(manager)) };
  const service = new ModelDefinitionService(
    settingsRepo as never,
    {} as never,
    writer as never,
    catalog as never,
    registry as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    storedModel = null;
    storedRate = null;
    currentChannel = channelRecord(PROVIDER_UID);
  });

  it('rejects an invalid input contract before creating a Catalog revision', async () => {
    await expect(
      service.create({
        ...validDto(),
        input_contract: {
          modes: [{ id: 'image', required_slots: [{ slot: 'source', type: 'url' }] }],
        },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(writer.create).not.toHaveBeenCalled();
  });

  it('rejects a blank input contract instead of treating it as absent', async () => {
    await expect(
      service.create({ ...validDto(), input_contract: {} } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(writer.create).not.toHaveBeenCalled();
  });

  it('rejects a Channel resource owned by another Provider', async () => {
    currentChannel = channelRecord(OTHER_PROVIDER_UID);

    await expect(
      service.create({
        ...validDto(),
        allowed_channel_resource_uids: [CHANNEL_UID],
      }),
    ).rejects.toThrow('allowed channels must be current Catalog channels');
    expect(writer.create).not.toHaveBeenCalled();
  });

  it('rejects a Channel that does not support the selected adapter', async () => {
    currentChannel = channelRecord(PROVIDER_UID, ['another-adapter']);

    await expect(service.create(validDto())).rejects.toThrow(
      'allowed channels must be current Catalog channels compatible with the selected adapter',
    );
    expect(writer.create).not.toHaveBeenCalled();
  });

  it('maps update Channel resource UIDs to the strict Catalog field', async () => {
    storedRate = rateCard();
    storedModel = modelWithRate();

    await service.update(MODEL_UID, {
      allowed_channel_resource_uids: [CHANNEL_UID],
      expected_revision: 1,
    });

    const appended = writer.append.mock.calls.find(([, uid]) => uid === MODEL_UID)?.[3];
    expect(appended).toEqual(
      expect.objectContaining({
        allowed_channel_uids: [CHANNEL_UID],
      }),
    );
    expect(Object.prototype.hasOwnProperty.call(appended, 'allowed_channel_resource_uids')).toBe(
      false,
    );
  });

  it('retires and unlinks pricing while preserving historical Rate Card revisions', async () => {
    storedRate = rateCard();
    storedModel = modelWithRate();

    const result = await service.update(MODEL_UID, {
      pricing: null,
      expected_revision: 1,
      expected_rate_revision: 1,
    } as never);

    expect(writer.retire).toHaveBeenCalledWith(manager, RATE_UID, 1);
    expect(writer.append).toHaveBeenCalledWith(
      manager,
      MODEL_UID,
      1,
      expect.objectContaining({ rate_card_uid: undefined }),
    );
    expect(storedRate).toEqual(expect.objectContaining({ revision: 2, lifecycle: 'retired' }));
    expect(result.pricing).toBeNull();
  });

  it('requires the exact Rate Card revision when unlinking pricing', async () => {
    storedRate = rateCard();
    storedModel = modelWithRate();

    await expect(
      service.update(MODEL_UID, {
        pricing: null,
        expected_revision: 1,
      } as never),
    ).rejects.toThrow('expected_rate_revision is required');

    expect(writer.retire).not.toHaveBeenCalled();
    expect(writer.append).not.toHaveBeenCalled();
  });
});

function validDto() {
  return {
    provider_resource_uid: PROVIDER_UID,
    model_id: 'manual:model',
    provider_model_id: 'upstream-model',
    display_name: 'Manual model',
    task_types: ['gen.text'],
    adapter_key: 'openai-compat',
    allowed_channel_resource_uids: [CHANNEL_UID],
  };
}

function providerRecord(): CatalogRecord<CatalogProvider> {
  return record(
    {
      kind: 'provider',
      resource_uid: PROVIDER_UID,
      revision: 1,
      lifecycle: 'active',
      slug: 'manual',
      display_name: 'Manual Provider',
      auth_method: 'api_key',
      auth_config: {},
      invocation_methods: ['http'],
      adapter_keys: ['openai-compat'],
      supported_regions: [],
    },
    'local',
  );
}

function channelRecord(
  providerUid: string,
  adapterKeys: string[] = ['openai-compat'],
): CatalogRecord<CatalogChannelTemplate> {
  return record(
    {
      kind: 'channel_template',
      resource_uid: CHANNEL_UID,
      revision: 1,
      lifecycle: 'active',
      slug: 'manual-default',
      provider_uid: providerUid,
      display_name: 'Manual Default',
      invocation_method: 'http',
      adapter_keys: adapterKeys,
      request_config: {},
    },
    'local',
  );
}

function modelWithRate(): CatalogModelOffering {
  return {
    kind: 'model_offering',
    resource_uid: MODEL_UID,
    revision: 1,
    lifecycle: 'active',
    slug: 'manual:model',
    provider_uid: PROVIDER_UID,
    model_id: 'manual:model',
    provider_model_id: 'upstream-model',
    display_name: 'Manual model',
    task_types: ['gen.text'],
    capabilities: [],
    invocation_mode: 'sync',
    adapter_key: 'openai-compat',
    supports_streaming: false,
    allowed_channel_uids: [CHANNEL_UID],
    tags: [],
    param_schema: { version: '1.0', groups: [], properties: {}, required: [], defaults: {} },
    param_constraints: [],
    limits: {},
    rate_card_uid: RATE_UID,
  };
}

function rateCard(): CatalogRateCard {
  return {
    kind: 'rate_card',
    resource_uid: RATE_UID,
    revision: 1,
    lifecycle: 'active',
    slug: 'manual:model:default',
    model_uid: MODEL_UID,
    pricing: {
      currency: 'USD',
      components: [{ meter: 'requests', per: 1, price: 0.1 }],
    },
  };
}

function record<
  T extends CatalogProvider | CatalogChannelTemplate | CatalogModelOffering | CatalogRateCard,
>(document: T, kind: 'official' | 'local'): CatalogRecord<T> {
  return {
    document,
    origin: {
      kind,
      source_id: '44444444-4444-4444-8444-444444444444',
      resource_uid: document.resource_uid,
      revision: document.revision,
      revision_id: '55555555-5555-4555-8555-555555555555',
      release_id: kind === 'official' ? '66666666-6666-4666-8666-666666666666' : null,
    },
  };
}
