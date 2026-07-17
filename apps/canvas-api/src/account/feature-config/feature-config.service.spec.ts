import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource, ObjectLiteral, Repository } from 'typeorm';

import type { ModelAvailabilityService } from '../invoke/model-availability.service';
import type { RegistryService } from '../registry';
import type { ModelRegistryEntry, RegistrySnapshot } from '../registry/types';
import { FeatureConfigService } from './feature-config.service';
import { FeatureModelBinding, FeatureModelConfig } from './feature-config.entity';

const MODEL_A_UID = '11111111-1111-4111-8111-111111111111';
const MODEL_B_UID = '22222222-2222-4222-8222-222222222222';
const PROVIDER_UID = '44444444-4444-4444-8444-444444444444';

describe('FeatureConfigService', () => {
  it('exposes the authoritative task type for every supported feature', async () => {
    const configs = repository<FeatureModelConfig>({
      findOne: jest.fn().mockResolvedValue(config([])),
    });
    const service = createService({ configs });

    await expect(service.getByKey('agent')).resolves.toMatchObject({
      feature_key: 'agent',
      required_task_type: 'gen.text',
    });
  });

  it('projects only the current model fields needed by the feature selector', () => {
    const service = createService({
      entries: [entry(MODEL_A_UID, 'example:model-a')],
    });

    expect(service.getModelOptions()).toEqual([
      {
        resource_uid: MODEL_A_UID,
        model_id: 'example:model-a',
        display_name: 'example:model-a',
        task_types: ['gen.text'],
        enabled: true,
        provider: { display_name: 'Example' },
      },
    ]);
    expect(service.getModelOptions()[0]).not.toHaveProperty('param_schema');
    expect(service.getModelOptions()[0]).not.toHaveProperty('pricing');
  });

  it('resolves the first available model by binding priority', async () => {
    const entries = [entry(MODEL_A_UID, 'example:model-a'), entry(MODEL_B_UID, 'example:model-b')];
    const configs = repository<FeatureModelConfig>({
      findOne: jest
        .fn()
        .mockResolvedValue(config([binding(MODEL_B_UID, 1), binding(MODEL_A_UID, 0)])),
    });
    const availability = {
      availableIds: jest.fn().mockResolvedValue(new Set(['example:model-b'])),
    } as unknown as ModelAvailabilityService;
    const service = createService({ configs, entries, availability });

    await expect(service.resolveModel('agent', { taskType: 'gen.text' })).resolves.toBe(
      'example:model-b',
    );
    expect(availability.availableIds).toHaveBeenCalledWith(
      ['example:model-a', 'example:model-b'],
      'gen.text',
      'live',
      expect.any(Object),
    );
  });

  it('fails closed when a feature has no available model', async () => {
    const configs = repository<FeatureModelConfig>({
      findOne: jest.fn().mockResolvedValue(config([binding(MODEL_A_UID, 0)])),
    });
    const availability = {
      availableIds: jest.fn().mockResolvedValue(new Set()),
    } as unknown as ModelAvailabilityService;
    const service = createService({
      configs,
      entries: [entry(MODEL_A_UID, 'example:model-a')],
      availability,
    });

    await expect(service.requireModel('agent')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(availability.availableIds).toHaveBeenCalledWith(
      ['example:model-a'],
      'gen.text',
      'live',
      expect.any(Object),
    );
  });

  it('rejects a caller task type that conflicts with the feature contract', async () => {
    const configs = repository<FeatureModelConfig>({
      findOne: jest.fn().mockResolvedValue(config([binding(MODEL_A_UID, 0)])),
    });
    const service = createService({
      configs,
      entries: [entry(MODEL_A_UID, 'example:model-a')],
    });

    await expect(service.resolveModel('agent', { taskType: 'gen.image' })).rejects.toThrow(
      'feature agent requires task type gen.text',
    );
  });

  it('rejects duplicate resource UIDs before writing', async () => {
    const service = createService({ entries: [entry(MODEL_A_UID, 'example:model-a')] });
    await expect(
      service.upsert('agent', {
        feature_key: 'agent',
        display_name: 'Agent',
        model_resource_uids: [MODEL_A_UID, MODEL_A_UID],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects resources that are not current Catalog models', async () => {
    const service = createService();
    await expect(
      service.upsert('agent', {
        feature_key: 'agent',
        display_name: 'Agent',
        model_resource_uids: [MODEL_A_UID],
      }),
    ).rejects.toThrow(`unknown or inactive model_resource_uid(s): ${MODEL_A_UID}`);
  });

  it('rejects current Catalog models that do not support the feature task type', async () => {
    const service = createService({
      entries: [entry(MODEL_A_UID, 'example:image-model', ['gen.image'])],
    });

    await expect(
      service.upsert('agent', {
        feature_key: 'agent',
        display_name: 'Agent',
        model_resource_uids: [MODEL_A_UID],
      }),
    ).rejects.toThrow(
      `model_resource_uid(s) do not support gen.text for feature agent: ${MODEL_A_UID}`,
    );
  });

  it('rejects feature keys without an explicit contract', async () => {
    const service = createService();

    await expect(
      service.upsert('unknown-feature', {
        feature_key: 'unknown-feature',
        display_name: 'Unknown',
        model_resource_uids: [],
      }),
    ).rejects.toThrow('unsupported feature_key: unknown-feature');
  });

  it('replaces bindings transactionally and derives contiguous priorities', async () => {
    const configRepo = repository<FeatureModelConfig>();
    const bindingRepo = repository<FeatureModelBinding>();
    const savedConfig = config([]);
    configRepo.findOne = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...savedConfig,
        bindings: [binding(MODEL_A_UID, 0), binding(MODEL_B_UID, 1)],
      });
    configRepo.create = jest.fn(
      (value) => value as FeatureModelConfig,
    ) as unknown as Repository<FeatureModelConfig>['create'];
    configRepo.save = jest.fn().mockResolvedValue(savedConfig);
    bindingRepo.create = jest.fn(
      (value) => value as FeatureModelBinding,
    ) as unknown as Repository<FeatureModelBinding>['create'];
    bindingRepo.delete = jest.fn().mockResolvedValue({ affected: 0, raw: [] });
    bindingRepo.save = jest.fn().mockImplementation(async (value) => value);
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === FeatureModelConfig ? configRepo : bindingRepo,
      ),
    };
    const dataSource = {
      transaction: jest.fn(async (work) => work(manager)),
    } as unknown as DataSource;
    const service = createService({
      dataSource,
      entries: [entry(MODEL_A_UID, 'example:model-a'), entry(MODEL_B_UID, 'example:model-b')],
    });

    await expect(
      service.upsert('agent', {
        feature_key: 'agent',
        display_name: 'Agent',
        model_resource_uids: [MODEL_A_UID, MODEL_B_UID],
      }),
    ).resolves.toMatchObject({
      feature_key: 'agent',
      model_resource_uids: [MODEL_A_UID, MODEL_B_UID],
    });
    expect(bindingRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ model_resource_uid: MODEL_A_UID, priority: 0 }),
      expect.objectContaining({ model_resource_uid: MODEL_B_UID, priority: 1 }),
    ]);
  });
});

function createService(
  overrides: {
    configs?: Repository<FeatureModelConfig>;
    dataSource?: DataSource;
    entries?: ModelRegistryEntry[];
    availability?: ModelAvailabilityService;
  } = {},
): FeatureConfigService {
  const entries = overrides.entries ?? [];
  const snapshot = {
    byId: new Map(entries.map((item) => [item.manifest.id, item])),
    providersByResourceUid: new Map([
      [
        PROVIDER_UID,
        {
          document: {
            resource_uid: PROVIDER_UID,
            slug: 'example',
            display_name: 'Example',
          },
        },
      ],
    ]),
  } as unknown as RegistrySnapshot;
  const registry = {
    isReady: jest.fn().mockReturnValue(true),
    getSnapshot: jest.fn().mockReturnValue(snapshot),
  } as unknown as RegistryService;
  const availability =
    overrides.availability ??
    ({
      availableIds: jest.fn().mockResolvedValue(new Set(entries.map((item) => item.manifest.id))),
    } as unknown as ModelAvailabilityService);
  const dataSource =
    overrides.dataSource ??
    ({
      transaction: jest.fn(),
    } as unknown as DataSource);
  return new FeatureConfigService(
    overrides.configs ?? repository<FeatureModelConfig>(),
    dataSource,
    registry,
    availability,
  );
}

function repository<T extends ObjectLiteral>(
  overrides: Partial<Repository<T>> = {},
): Repository<T> {
  return overrides as Repository<T>;
}

function config(bindings: FeatureModelBinding[]): FeatureModelConfig {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    feature_key: 'agent',
    display_name: 'Agent',
    description: null,
    enabled: true,
    bindings,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };
}

function binding(modelResourceUid: string, priority: number): FeatureModelBinding {
  return {
    feature_config_id: '33333333-3333-4333-8333-333333333333',
    model_resource_uid: modelResourceUid,
    priority,
    feature_config: undefined as unknown as FeatureModelConfig,
  };
}

function entry(
  modelResourceUid: string,
  modelId: string,
  taskTypes: ModelRegistryEntry['manifest']['task_types'] = ['gen.text'],
): ModelRegistryEntry {
  return {
    manifest: {
      id: modelId,
      display_name: modelId,
      provider_key: 'example',
      adapter_key: 'openai-compat',
      provider_model: modelId,
      task_types: taskTypes,
      capabilities: ['text_chat'],
      invocation_mode: 'sync',
      enabled: true,
      visibility: 'public',
    },
    document: { lifecycle: 'active' },
    provider_resource_uid: PROVIDER_UID,
    pin: {
      model_resource_uid: modelResourceUid,
      model_revision_id: `${modelResourceUid}:revision`,
      rate_card_revision_id: null,
      catalog_epoch: '1',
    },
  } as unknown as ModelRegistryEntry;
}
