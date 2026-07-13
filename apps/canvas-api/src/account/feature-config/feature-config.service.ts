import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CredentialService } from '../credential/credential.service';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import { FeatureModelConfig } from './feature-config.entity';
import type { UpsertFeatureConfigDto } from './feature-config.dto';

@Injectable()
export class FeatureConfigService {
  private readonly logger = new Logger(FeatureConfigService.name);

  constructor(
    @InjectRepository(FeatureModelConfig)
    private readonly repo: Repository<FeatureModelConfig>,
    @InjectRepository(ModelDefinition)
    private readonly modelRepo: Repository<ModelDefinition>,
    private readonly credentials: CredentialService,
  ) {}

  async getAll(): Promise<FeatureModelConfig[]> {
    return this.repo.find({ order: { feature_key: 'ASC' } });
  }

  async getByKey(featureKey: string): Promise<FeatureModelConfig | null> {
    return this.repo.findOne({ where: { feature_key: featureKey } });
  }

  async upsert(featureKey: string, dto: UpsertFeatureConfigDto): Promise<FeatureModelConfig> {
    if (dto.feature_key !== featureKey) {
      throw new BadRequestException('feature_key in body must match route key');
    }
    await this.validateConfig(dto);
    const existing = await this.repo.findOne({ where: { feature_key: featureKey } });
    if (existing) {
      // Use update() for reliable change detection on array columns
      await this.repo.update(
        { feature_key: featureKey },
        {
          display_name: dto.display_name,
          description: dto.description,
          model_ids: dto.model_ids,
          primary_model_id: dto.primary_model_id ?? null,
          fallback_model_id: dto.fallback_model_id ?? null,
          enabled: dto.enabled ?? true,
        },
      );
      return this.repo.findOneOrFail({ where: { feature_key: featureKey } });
    }
    const config = this.repo.create({
      feature_key: dto.feature_key,
      display_name: dto.display_name,
      description: dto.description,
      model_ids: dto.model_ids,
      primary_model_id: dto.primary_model_id ?? null,
      fallback_model_id: dto.fallback_model_id ?? null,
      enabled: dto.enabled ?? true,
    });
    return this.repo.save(config);
  }

  async delete(featureKey: string): Promise<void> {
    const config = await this.repo.findOne({ where: { feature_key: featureKey } });
    if (!config) throw new NotFoundException(`feature config not found: ${featureKey}`);
    await this.repo.remove(config);
  }

  /**
   * Resolve the best available model for a feature.
   * Order: primary → fallback → first available from pool.
   * A model is "available" if the DB row is enabled and its provider has at
   * least one enabled credential on an enabled channel.
   */
  async resolveModel(featureKey: string): Promise<string | null> {
    const config = await this.getByKey(featureKey);
    if (!config || !config.enabled || config.model_ids.length === 0) {
      this.logger.debug(`feature ${featureKey}: no config or disabled/empty`);
      return null;
    }

    const available = await this.availableModelIds(config.model_ids);
    const isAvailable = (modelId: string): boolean => available.has(modelId);

    // 1) primary
    if (config.primary_model_id && isAvailable(config.primary_model_id)) {
      return config.primary_model_id;
    }

    // 2) fallback
    if (config.fallback_model_id && isAvailable(config.fallback_model_id)) {
      return config.fallback_model_id;
    }

    // 3) first available from pool
    for (const mid of config.model_ids) {
      if (isAvailable(mid)) {
        this.logger.warn(
          `feature ${featureKey}: primary/fallback unavailable, using pool model ${mid}`,
        );
        return mid;
      }
    }

    this.logger.warn(`feature ${featureKey}: no available model (pool=${config.model_ids.join(',')})`);
    return null;
  }

  private async validateConfig(dto: UpsertFeatureConfigDto): Promise<void> {
    const pool = new Set(dto.model_ids);
    for (const [label, modelId] of [
      ['primary_model_id', dto.primary_model_id],
      ['fallback_model_id', dto.fallback_model_id],
    ] as const) {
      if (modelId && !pool.has(modelId)) {
        throw new BadRequestException(`${label} must be included in model_ids`);
      }
    }
    if (dto.model_ids.length === 0) return;
    const rows = await this.modelRepo.find({ where: { model_id: In(dto.model_ids) } });
    const existing = new Set(rows.map((m) => m.model_id));
    const missing = dto.model_ids.filter((id) => !existing.has(id));
    if (missing.length) {
      throw new BadRequestException(`unknown model_id(s): ${missing.join(', ')}`);
    }
    const available = await this.availableModelIds(dto.model_ids);
    const unavailable = dto.model_ids.filter((id) => !available.has(id));
    if (unavailable.length) {
      throw new BadRequestException(`unavailable model_id(s): ${unavailable.join(', ')}`);
    }
  }

  private async availableModelIds(modelIds: string[]): Promise<Set<string>> {
    const activeProviders = await this.credentials.getProviderSlugsWithCredentials();
    const rows = await this.modelRepo.find({
      where: { model_id: In(modelIds), enabled: true },
      relations: ['provider'],
    });
    return new Set(
      rows
        .filter((m) => m.provider?.enabled && activeProviders.has(m.provider.slug))
        .map((m) => m.model_id),
    );
  }
}
