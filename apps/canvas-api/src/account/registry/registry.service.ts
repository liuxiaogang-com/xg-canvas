import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProviderAdapter } from '@xgcanvas/adapters-contract';
import type { TaskType } from '@xgcanvas/shared-types';

import { AdapterRegistry } from '../adapters/registry';
import type { ModelRegistryEntry, RegistrySnapshot } from './types';

/**
 * Runtime read API for the model registry.
 * The snapshot itself is owned by RegistryBootstrapService and swapped
 * atomically on `reload()`.
 */
@Injectable()
export class RegistryService {
  private snapshot: RegistrySnapshot = emptySnapshot();

  constructor(private readonly adapters: AdapterRegistry) {}

  setSnapshot(s: RegistrySnapshot): void {
    this.snapshot = s;
  }

  getSnapshot(): RegistrySnapshot {
    return this.snapshot;
  }

  getEntry(modelId: string): ModelRegistryEntry | null {
    return this.snapshot.byId.get(modelId) ?? null;
  }

  requireEntry(modelId: string): ModelRegistryEntry {
    const e = this.getEntry(modelId);
    if (!e) throw new NotFoundException(`model not registered: ${modelId}`);
    return e;
  }

  listByTaskType(taskType: TaskType): readonly ModelRegistryEntry[] {
    return this.snapshot.byTaskType.get(taskType) ?? [];
  }

  listByProvider(providerKey: string): readonly ModelRegistryEntry[] {
    return this.snapshot.byProvider.get(providerKey) ?? [];
  }

  getAdapterFor(modelId: string): ProviderAdapter {
    const entry = this.requireEntry(modelId);
    return this.adapters.get(entry.manifest.adapter_key);
  }
}

function emptySnapshot(): RegistrySnapshot {
  return {
    byId: new Map(),
    byTaskType: new Map(),
    byProvider: new Map(),
    loaded_at: new Date().toISOString(),
  };
}
