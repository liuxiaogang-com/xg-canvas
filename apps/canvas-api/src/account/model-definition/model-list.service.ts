import { Injectable } from '@nestjs/common';
import type { ModelInputContract, TaskType } from '@xgcanvas/shared-types';
import { ModelAvailabilityService } from '../invoke/model-availability.service';
import { RegistryService } from '../registry';
import type { ModelDefinitionView } from './model-definition.service';
import { ModelDefinitionService } from './model-definition.service';
import {
  estimateModelPricing,
  formatModelPricingSummary,
  type ModelCostEstimate,
} from './model-pricing-presenter';

export interface ModelListItem {
  model_id: string;
  model_resource_uid: string;
  model_revision_id: string;
  catalog_epoch: string;
  display_name: string;
  description: string;
  provider: {
    slug: string;
    display_name: string;
    icon_url: string;
  };
  task_types: string[];
  capabilities: string[];
  invocation_mode: string;
  supports_streaming: boolean;
  tags: string[];
  deprecated: boolean;
  deprecated_message?: string;
  input_contract?: ModelInputContract;
  pricing_summary?: string;
}

export interface ModelListFilter {
  taskType?: string;
  capabilities?: string[];
  executionMode?: 'live' | 'demo';
}

export type ModelDetail = ModelDefinitionView & { catalog_epoch: string };

@Injectable()
export class ModelListService {
  constructor(
    private readonly registry: RegistryService,
    private readonly availability: ModelAvailabilityService,
    private readonly definitions: ModelDefinitionService,
  ) {}

  async getAvailableModels(filter: ModelListFilter): Promise<ModelListItem[]> {
    const snapshot = this.registry.getSnapshot();
    const entries = [...snapshot.byId.values()].filter(
      (entry) =>
        entry.manifest.enabled &&
        entry.manifest.visibility === 'public' &&
        (!filter.taskType || entry.manifest.task_types.includes(filter.taskType as TaskType)) &&
        (!filter.capabilities?.length ||
          filter.capabilities.every((capability) =>
            entry.manifest.capabilities.includes(capability as never),
          )),
    );
    const available = await this.availability.availableIds(
      entries.map((entry) => entry.manifest.id),
      filter.taskType as TaskType | undefined,
      filter.executionMode ?? 'live',
      snapshot,
    );
    return entries.flatMap((entry) => {
      if (!available.has(entry.manifest.id)) return [];
      const provider = snapshot.providersByResourceUid.get(entry.provider_resource_uid);
      if (!provider) return [];
      const rate = entry.pin.rate_card_revision_id
        ? snapshot.rateCardsByRevisionId.get(entry.pin.rate_card_revision_id)
        : null;
      return [
        {
          model_id: entry.manifest.id,
          model_resource_uid: entry.pin.model_resource_uid,
          model_revision_id: entry.pin.model_revision_id,
          catalog_epoch: entry.pin.catalog_epoch,
          display_name: entry.manifest.display_name,
          description: entry.document.description ?? '',
          provider: {
            slug: provider.document.slug,
            display_name: provider.document.display_name,
            icon_url: provider.document.icon_url ?? '',
          },
          task_types: [...entry.manifest.task_types],
          capabilities: [...entry.manifest.capabilities],
          invocation_mode: entry.manifest.invocation_mode,
          supports_streaming: entry.document.supports_streaming,
          tags: [...entry.document.tags],
          deprecated: entry.document.lifecycle === 'deprecated',
          deprecated_message: entry.document.deprecated_message,
          input_contract: entry.manifest.input_contract,
          pricing_summary: rate ? formatModelPricingSummary(rate.pricing) : undefined,
        },
      ];
    });
  }

  async getModelDetail(
    modelId: string,
    executionMode: 'live' | 'demo' = 'live',
  ): Promise<ModelDetail | null> {
    const snapshot = this.registry.getSnapshot();
    const entry = this.registry.getEntry(modelId, snapshot);
    if (
      !entry ||
      !entry.manifest.enabled ||
      entry.manifest.visibility !== 'public' ||
      !(await this.availability.isCurrentAvailable(modelId, undefined, executionMode, snapshot))
    )
      return null;
    return {
      ...(await this.definitions.findOne(entry.pin.model_resource_uid)),
      catalog_epoch: entry.pin.catalog_epoch,
    };
  }

  estimateCost(
    model: ModelDefinitionView,
    params: Record<string, unknown>,
    inputTextLength?: number,
  ): ModelCostEstimate {
    return estimateModelPricing(model.pricing ?? {}, params, inputTextLength);
  }
}
