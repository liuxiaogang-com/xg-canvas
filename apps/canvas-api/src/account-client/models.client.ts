import { Injectable } from '@nestjs/common';
import type { ModelRevisionPin, TaskType } from '@xgcanvas/shared-types';

import { FeatureConfigService } from '../account/feature-config/feature-config.service';
import { ModelAvailabilityService } from '../account/invoke/model-availability.service';
import {
  type ModelDetail,
  type ModelListFilter,
  type ModelListItem,
  ModelListService,
} from '../account/model-definition/model-list.service';
import type { ModelCostEstimate } from '../account/model-definition/model-pricing-presenter';
import { RegistryService } from '../account/registry/registry.service';
import type { ModelSummary } from './types';

export type AccountModelDetail = ModelDetail;
export type AccountModelListFilter = ModelListFilter;
export type AccountModelListItem = ModelListItem;
export type AccountModelCostEstimate = ModelCostEstimate;

/**
 * Account-client seam for registry-backed model reads. Business modules use
 * this client instead of depending on account/model-definition internals.
 */
@Injectable()
export class AccountModelsClient {
  constructor(
    private readonly registry: RegistryService,
    private readonly availability: ModelAvailabilityService,
    private readonly featureConfig: FeatureConfigService,
    private readonly modelList: ModelListService,
  ) {}

  async list(): Promise<ModelSummary[]> {
    const snap = this.registry.getSnapshot();
    return Array.from(snap.byId.values()).map((e) => ({
      id: e.manifest.id,
      provider_key: e.manifest.provider_key,
      adapter_key: e.manifest.adapter_key,
      task_types: e.manifest.task_types,
      invocation_mode: e.manifest.invocation_mode as ModelSummary['invocation_mode'],
    }));
  }

  isReady(): boolean {
    return this.registry.isReady();
  }

  async resolveTaskPin(
    modelId: string,
    taskType: TaskType,
    executionMode: 'live' | 'demo' = 'live',
  ): Promise<{ model_id: string; pin: ModelRevisionPin }> {
    return this.availability.requireCurrent(modelId, taskType, executionMode);
  }

  async assertTaskPin(pin: ModelRevisionPin): Promise<void> {
    this.registry.requirePinnedEntry(pin);
  }

  async requireFeatureModel(
    featureKey: string,
    taskType?: TaskType,
    executionMode: 'live' | 'demo' = 'live',
  ): Promise<string> {
    return this.featureConfig.requireModel(featureKey, { taskType, executionMode });
  }

  async getRateCardPricing(revisionId: string): Promise<Record<string, unknown> | null> {
    return this.registry.getRateCardRevision(revisionId)?.pricing ?? null;
  }

  getAvailableModels(filter: AccountModelListFilter): Promise<AccountModelListItem[]> {
    return this.modelList.getAvailableModels(filter);
  }

  getModelDetail(
    modelId: string,
    executionMode: 'live' | 'demo' = 'live',
  ): Promise<AccountModelDetail | null> {
    return this.modelList.getModelDetail(modelId, executionMode);
  }

  estimateCost(
    model: AccountModelDetail,
    params: Record<string, unknown>,
    inputTextLength?: number,
  ): AccountModelCostEstimate {
    return this.modelList.estimateCost(model, params, inputTextLength);
  }
}
