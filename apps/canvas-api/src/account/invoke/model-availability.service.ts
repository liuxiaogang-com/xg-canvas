import { Injectable, NotFoundException } from '@nestjs/common';
import { AdapterError } from '@xgcanvas/adapters-contract';
import { isCatalogCurrentLifecycle } from '@xgcanvas/model-catalog';
import { ERROR_CODES, type ModelRevisionPin, type TaskType } from '@xgcanvas/shared-types';
import { RegistryService } from '../registry';
import type { ModelRegistryEntry, RegistrySnapshot } from '../registry/types';

const EXPECTED_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.MODEL_NOT_FOUND,
  ERROR_CODES.MODEL_DISABLED,
  ERROR_CODES.CHANNEL_UNAVAILABLE,
  ERROR_CODES.CREDENTIAL_INVALID,
]);

export interface CurrentModelResolution {
  model_id: string;
  pin: ModelRevisionPin;
}

@Injectable()
export class ModelAvailabilityService {
  constructor(private readonly registry: RegistryService) {}

  canonicalModelId(
    modelId: string,
    taskType?: TaskType,
    snapshot: RegistrySnapshot = this.registry.getSnapshot(),
  ): string {
    const entry = this.registry.requireEntry(modelId, snapshot);
    this.registry.resolveEntryTaskPin(entry, taskType);
    return entry.manifest.id;
  }

  canonicalModelIdOrNull(
    modelId: string,
    taskType?: TaskType,
    snapshot: RegistrySnapshot = this.registry.getSnapshot(),
  ): string | null {
    try {
      return this.canonicalModelId(modelId, taskType, snapshot);
    } catch (error) {
      if (isExpectedUnavailable(error)) return null;
      throw error;
    }
  }

  async requireCurrent(
    modelId: string,
    taskType?: TaskType,
    executionMode: 'live' | 'demo' = 'live',
    snapshot: RegistrySnapshot = this.registry.getSnapshot(),
  ): Promise<CurrentModelResolution> {
    const entry = this.registry.requireEntry(modelId, snapshot);
    const pin = this.registry.resolveEntryTaskPin(entry, taskType);
    if (!this.hasEnabledRoute(entry, snapshot, executionMode === 'live')) {
      throw new AdapterError({
        code:
          executionMode === 'live'
            ? ERROR_CODES.CREDENTIAL_INVALID
            : ERROR_CODES.CHANNEL_UNAVAILABLE,
        message:
          executionMode === 'live'
            ? `model has no enabled channel and credential: ${entry.manifest.id}`
            : `model has no enabled provider and channel: ${entry.manifest.id}`,
        retryable: false,
      });
    }
    return { model_id: entry.manifest.id, pin };
  }

  async isCurrentAvailable(
    modelId: string,
    taskType?: TaskType,
    executionMode: 'live' | 'demo' = 'live',
    snapshot: RegistrySnapshot = this.registry.getSnapshot(),
  ): Promise<boolean> {
    try {
      await this.requireCurrent(modelId, taskType, executionMode, snapshot);
      return true;
    } catch (error) {
      if (isExpectedUnavailable(error)) return false;
      throw error;
    }
  }

  async availableIds(
    modelIds: readonly string[],
    taskType?: TaskType,
    executionMode: 'live' | 'demo' = 'live',
    snapshot: RegistrySnapshot = this.registry.getSnapshot(),
  ): Promise<Set<string>> {
    const available = new Set<string>();
    for (const modelId of new Set(modelIds)) {
      try {
        const entry = this.registry.requireEntry(modelId, snapshot);
        this.registry.resolveEntryTaskPin(entry, taskType);
        if (this.hasEnabledRoute(entry, snapshot, executionMode === 'live')) {
          available.add(modelId);
        }
      } catch (error) {
        if (!isExpectedUnavailable(error)) throw error;
      }
    }
    return available;
  }

  private hasEnabledRoute(
    entry: ModelRegistryEntry,
    snapshot: RegistrySnapshot,
    requireCredential: boolean,
  ): boolean {
    const provider = this.registry.getProvider(entry.provider_resource_uid, snapshot);
    if (!provider?.enabled || !isCatalogCurrentLifecycle(provider.document.lifecycle)) return false;
    const allowed = new Set(entry.allowed_channel_resource_uids);
    if (allowed.size === 0) return false;
    return [...snapshot.channelsByResourceUid.values()].some(
      (channel) =>
        channel.document.provider_uid === entry.provider_resource_uid &&
        channel.enabled &&
        isCatalogCurrentLifecycle(channel.document.lifecycle) &&
        channel.document.adapter_keys.includes(entry.manifest.adapter_key) &&
        (!requireCredential || channel.enabled_credential_ids.length > 0) &&
        allowed.has(channel.document.resource_uid),
    );
  }
}

function isExpectedUnavailable(error: unknown): boolean {
  return (
    error instanceof NotFoundException ||
    (error instanceof AdapterError && EXPECTED_UNAVAILABLE_CODES.has(error.code))
  );
}
