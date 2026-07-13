import { Injectable } from '@nestjs/common';

import { RegistryService } from '../account/registry/registry.service';
import type { ModelSummary } from './types';

/**
 * Account-client seam — model registry list. Since M6 P2 it reads the in-process
 * RegistryService snapshot instead of GET /admin/v1/registry/snapshot on a
 * separate account-api. Mapping mirrors the former HTTP response shape.
 */
@Injectable()
export class AccountModelsClient {
  constructor(private readonly registry: RegistryService) {}

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
}
