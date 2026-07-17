import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isCatalogCurrentLifecycle } from '@xgcanvas/model-catalog';
import type { ModelRevisionPin, TaskType } from '@xgcanvas/shared-types';
import { DataSource, type Repository } from 'typeorm';

import { ModelAvailabilityService } from '../invoke/model-availability.service';
import { RegistryService } from '../registry';
import type { ModelRegistryEntry, RegistrySnapshot } from '../registry/types';
import type { UpsertFeatureConfigDto } from './feature-config.dto';
import { featureRequiredTaskType } from './feature-config.contract';
import { FeatureModelBinding, FeatureModelConfig } from './feature-config.entity';

export interface FeatureModelConfigView {
  id: string;
  feature_key: string;
  required_task_type: TaskType;
  display_name: string;
  description: string | null;
  model_resource_uids: string[];
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FeatureModelResolution {
  model_resource_uid: string;
  model_id: string;
  pin: ModelRevisionPin;
}

export interface FeatureModelOptionView {
  resource_uid: string;
  model_id: string;
  display_name: string;
  task_types: TaskType[];
  enabled: boolean;
  provider: {
    display_name: string;
  };
}

export interface FeatureModelResolveOptions {
  taskType?: TaskType;
}

@Injectable()
export class FeatureConfigService {
  private readonly logger = new Logger(FeatureConfigService.name);

  constructor(
    @InjectRepository(FeatureModelConfig)
    private readonly configs: Repository<FeatureModelConfig>,
    private readonly dataSource: DataSource,
    private readonly registry: RegistryService,
    private readonly availability: ModelAvailabilityService,
  ) {}

  async getAll(): Promise<FeatureModelConfigView[]> {
    const configs = await this.configs.find({
      relations: { bindings: true },
      order: { feature_key: 'ASC', bindings: { priority: 'ASC' } },
    });
    return configs.map((config) => toView(config, this.requireFeatureTaskType(config.feature_key)));
  }

  async getByKey(featureKey: string): Promise<FeatureModelConfigView | null> {
    const requiredTaskType = this.requireFeatureTaskType(featureKey);
    const config = await this.findEntityByKey(this.configs, featureKey);
    return config ? toView(config, requiredTaskType) : null;
  }

  getModelOptions(): FeatureModelOptionView[] {
    if (!this.registry.isReady()) {
      throw new ServiceUnavailableException('model registry is not ready');
    }
    const snapshot = this.registry.getSnapshot();
    return [...snapshot.byId.values()]
      .map((entry) => {
        const provider = snapshot.providersByResourceUid.get(entry.provider_resource_uid);
        if (!provider) {
          throw new ServiceUnavailableException(
            `model provider is missing from registry snapshot: ${entry.provider_resource_uid}`,
          );
        }
        return {
          resource_uid: entry.pin.model_resource_uid,
          model_id: entry.manifest.id,
          display_name: entry.manifest.display_name,
          task_types: [...entry.manifest.task_types],
          enabled: entry.manifest.enabled === true,
          provider: {
            display_name: provider.document.display_name,
          },
        };
      })
      .sort(
        (left, right) =>
          left.provider.display_name.localeCompare(right.provider.display_name) ||
          left.display_name.localeCompare(right.display_name) ||
          left.resource_uid.localeCompare(right.resource_uid),
      );
  }

  async upsert(featureKey: string, dto: UpsertFeatureConfigDto): Promise<FeatureModelConfigView> {
    if (dto.feature_key !== featureKey) {
      throw new BadRequestException('feature_key in body must match route key');
    }
    const requiredTaskType = this.requireFeatureTaskType(featureKey);
    const modelResourceUids = uniqueResourceUids(dto.model_resource_uids);
    this.requireCatalogModels(featureKey, requiredTaskType, modelResourceUids);

    return this.dataSource.transaction(async (manager) => {
      const configRepo = manager.getRepository(FeatureModelConfig);
      const bindingRepo = manager.getRepository(FeatureModelBinding);
      const existing = await configRepo.findOne({ where: { feature_key: featureKey } });
      const config = await configRepo.save(
        configRepo.create({
          id: existing?.id,
          feature_key: featureKey,
          display_name: dto.display_name,
          description: dto.description ?? null,
          enabled: dto.enabled ?? existing?.enabled ?? true,
        }),
      );

      await bindingRepo.delete({ feature_config_id: config.id });
      if (modelResourceUids.length > 0) {
        await bindingRepo.save(
          modelResourceUids.map((modelResourceUid, priority) =>
            bindingRepo.create({
              feature_config_id: config.id,
              model_resource_uid: modelResourceUid,
              priority,
            }),
          ),
        );
      }

      const saved = await this.findEntityByKey(configRepo, featureKey);
      if (!saved) throw new Error(`feature config disappeared after save: ${featureKey}`);
      return toView(saved, requiredTaskType);
    });
  }

  async delete(featureKey: string): Promise<void> {
    this.requireFeatureTaskType(featureKey);
    const result = await this.configs.delete({ feature_key: featureKey });
    if (!result.affected) {
      throw new NotFoundException(`feature config not found: ${featureKey}`);
    }
  }

  async resolveModelSelection(
    featureKey: string,
    options: FeatureModelResolveOptions = {},
  ): Promise<FeatureModelResolution | null> {
    const requiredTaskType = this.requireFeatureTaskType(featureKey, options.taskType);
    const config = await this.findEntityByKey(this.configs, featureKey);
    if (!config?.enabled || config.bindings.length === 0) return null;

    const snapshot = this.registry.getSnapshot();
    const entriesByResourceUid = this.currentEntriesByResourceUid(snapshot);
    const candidates = [...config.bindings]
      .sort((a, b) => a.priority - b.priority)
      .map((binding) => entriesByResourceUid.get(binding.model_resource_uid))
      .filter((entry): entry is ModelRegistryEntry =>
        Boolean(entry && isCatalogCurrentLifecycle(entry.document.lifecycle)),
      );
    const available = await this.availability.availableIds(
      candidates.map((entry) => entry.manifest.id),
      requiredTaskType,
      snapshot,
    );
    const selected = candidates.find((entry) => available.has(entry.manifest.id));
    if (!selected) {
      this.logger.warn(`feature ${featureKey}: no currently available bound model`);
      return null;
    }
    return {
      model_resource_uid: selected.pin.model_resource_uid,
      model_id: selected.manifest.id,
      pin: { ...selected.pin },
    };
  }

  async resolveModel(
    featureKey: string,
    options: FeatureModelResolveOptions = {},
  ): Promise<string | null> {
    return (await this.resolveModelSelection(featureKey, options))?.model_id ?? null;
  }

  async requireModel(
    featureKey: string,
    options: FeatureModelResolveOptions = {},
  ): Promise<string> {
    const modelId = await this.resolveModel(featureKey, options);
    if (modelId) return modelId;
    throw new ServiceUnavailableException({
      code: 'FEATURE_MODEL_UNAVAILABLE',
      message: `feature has no configured and available model: ${featureKey}`,
    });
  }

  private requireCatalogModels(
    featureKey: string,
    requiredTaskType: TaskType,
    resourceUids: readonly string[],
  ): void {
    if (!this.registry.isReady()) {
      throw new ServiceUnavailableException('model registry is not ready');
    }
    const entriesByResourceUid = this.currentEntriesByResourceUid(this.registry.getSnapshot());
    const invalid: string[] = [];
    const incompatible: string[] = [];
    for (const resourceUid of resourceUids) {
      const entry = entriesByResourceUid.get(resourceUid);
      if (!entry || !isCatalogCurrentLifecycle(entry.document.lifecycle)) {
        invalid.push(resourceUid);
      } else if (!entry.manifest.task_types.includes(requiredTaskType)) {
        incompatible.push(resourceUid);
      }
    }
    if (invalid.length > 0) {
      throw new BadRequestException(
        `unknown or inactive model_resource_uid(s): ${invalid.join(', ')}`,
      );
    }
    if (incompatible.length > 0) {
      throw new BadRequestException(
        `model_resource_uid(s) do not support ${requiredTaskType} for feature ${featureKey}: ${incompatible.join(', ')}`,
      );
    }
  }

  private requireFeatureTaskType(featureKey: string, requested?: TaskType): TaskType {
    const required = featureRequiredTaskType(featureKey);
    if (!required) {
      throw new BadRequestException(`unsupported feature_key: ${featureKey}`);
    }
    if (requested && requested !== required) {
      throw new BadRequestException(
        `feature ${featureKey} requires task type ${required}, received ${requested}`,
      );
    }
    return required;
  }

  private currentEntriesByResourceUid(
    snapshot: RegistrySnapshot,
  ): ReadonlyMap<string, ModelRegistryEntry> {
    return new Map(
      [...snapshot.byId.values()].map((entry) => [entry.pin.model_resource_uid, entry]),
    );
  }

  private findEntityByKey(
    repository: Repository<FeatureModelConfig>,
    featureKey: string,
  ): Promise<FeatureModelConfig | null> {
    return repository.findOne({
      where: { feature_key: featureKey },
      relations: { bindings: true },
      order: { bindings: { priority: 'ASC' } },
    });
  }
}

function uniqueResourceUids(resourceUids: readonly string[]): string[] {
  const unique = [...new Set(resourceUids)];
  if (unique.length !== resourceUids.length) {
    throw new BadRequestException('model_resource_uids must not contain duplicates');
  }
  return unique;
}

function toView(config: FeatureModelConfig, requiredTaskType: TaskType): FeatureModelConfigView {
  const bindings = [...(config.bindings ?? [])].sort((a, b) => a.priority - b.priority);
  return {
    id: config.id,
    feature_key: config.feature_key,
    required_task_type: requiredTaskType,
    display_name: config.display_name,
    description: config.description,
    model_resource_uids: bindings.map((binding) => binding.model_resource_uid),
    enabled: config.enabled,
    created_at: config.created_at,
    updated_at: config.updated_at,
  };
}
