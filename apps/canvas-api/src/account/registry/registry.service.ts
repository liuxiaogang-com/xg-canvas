import { Injectable, NotFoundException } from '@nestjs/common';
import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES, type ModelRevisionPin, type TaskType } from '@xgcanvas/shared-types';

import type { ModelRegistryEntry, RegistrySnapshot } from './types';

/**
 * Runtime read API for the model registry.
 * The snapshot itself is owned by RegistryBootstrapService and swapped
 * atomically on `reload()`.
 */
@Injectable()
export class RegistryService {
  private snapshot: RegistrySnapshot = emptySnapshot();
  private ready = false;

  setSnapshot(s: RegistrySnapshot): void {
    this.snapshot = s;
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  getSnapshot(): RegistrySnapshot {
    return this.snapshot;
  }

  getEntry(modelId: string, snapshot: RegistrySnapshot = this.snapshot): ModelRegistryEntry | null {
    return snapshot.byId.get(modelId) ?? null;
  }

  requireEntry(modelId: string, snapshot: RegistrySnapshot = this.snapshot): ModelRegistryEntry {
    const e = this.getEntry(modelId, snapshot);
    if (!e) throw new NotFoundException(`model not registered: ${modelId}`);
    return e;
  }

  resolveTaskPin(modelId: string, taskType?: TaskType): ModelRevisionPin {
    const entry = this.requireEntry(modelId);
    return this.resolveEntryTaskPin(entry, taskType);
  }

  resolveEntryTaskPin(entry: ModelRegistryEntry, taskType?: TaskType): ModelRevisionPin {
    if (!entry.manifest.enabled) {
      throw new AdapterError({
        code: ERROR_CODES.MODEL_DISABLED,
        message: `model disabled: ${entry.manifest.id}`,
        retryable: false,
      });
    }
    if (taskType && !entry.manifest.task_types.includes(taskType)) {
      throw new NotFoundException(
        `model ${entry.manifest.id} does not support task type ${taskType}`,
      );
    }
    return { ...entry.pin };
  }

  requirePinnedEntry(
    pin: ModelRevisionPin,
    snapshot: RegistrySnapshot = this.snapshot,
  ): ModelRegistryEntry {
    const entry = snapshot.byRevisionId.get(pin.model_revision_id);
    if (!entry || entry.origin.resource_uid !== pin.model_resource_uid) {
      throw missingRevision(`model revision not registered: ${pin.model_revision_id}`);
    }
    const rate = pin.rate_card_revision_id
      ? snapshot.rateCardsByRevisionId.get(pin.rate_card_revision_id)
      : null;
    if (pin.rate_card_revision_id && !rate) {
      throw missingRevision(`rate-card revision not registered: ${pin.rate_card_revision_id}`);
    }
    if (
      entry.rate_card_resource_uid !== (rate?.resource_uid ?? null) ||
      (rate && rate.model_resource_uid !== pin.model_resource_uid)
    ) {
      throw missingRevision(
        `rate-card revision does not belong to model revision: ${pin.model_revision_id}`,
      );
    }
    return entry;
  }

  getRateCardRevision(revisionId: string) {
    return this.snapshot.rateCardsByRevisionId.get(revisionId) ?? null;
  }

  getProvider(resourceUid: string, snapshot: RegistrySnapshot = this.snapshot) {
    return snapshot.providersByResourceUid.get(resourceUid) ?? null;
  }

  getChannel(resourceUid: string, snapshot: RegistrySnapshot = this.snapshot) {
    return snapshot.channelsByResourceUid.get(resourceUid) ?? null;
  }

  listByTaskType(taskType: TaskType): readonly ModelRegistryEntry[] {
    return this.snapshot.byTaskType.get(taskType) ?? [];
  }

  listByProvider(providerKey: string): readonly ModelRegistryEntry[] {
    return this.snapshot.byProvider.get(providerKey) ?? [];
  }

}

function missingRevision(message: string): AdapterError {
  return new AdapterError({
    code: ERROR_CODES.CATALOG_REVISION_MISSING,
    message,
    retryable: false,
  });
}

function emptySnapshot(): RegistrySnapshot {
  return {
    byId: new Map(),
    byRevisionId: new Map(),
    providersByResourceUid: new Map(),
    channelsByResourceUid: new Map(),
    rateCardsByRevisionId: new Map(),
    byTaskType: new Map(),
    byProvider: new Map(),
    loaded_at: new Date().toISOString(),
    catalog_epoch: '0',
    content_digest: '',
  };
}
