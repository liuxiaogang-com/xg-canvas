import { Injectable } from '@nestjs/common';

import { ModelListService } from '../account/model-definition/model-list.service';
import { ObjectStorageClient } from '../account/storage/object-storage.client';
import { SmtpSettingsClient } from '../account/storage/smtp-settings.client';
import {
  READINESS_CATALOG,
  type ReadinessCatalogEntry,
  type ReadinessItemId,
  type ReadinessStatus,
  type ReadinessSurface,
} from './readiness-catalog';

export interface ReadinessItemResult {
  id: ReadinessItemId;
  status: ReadinessStatus;
}

export interface ReadinessSurfaceResult {
  ready: boolean;
  missing: ReadinessItemId[];
}

export interface InstanceReadinessSnapshot {
  items: ReadinessItemResult[];
  surfaces: Record<string, ReadinessSurfaceResult>;
}

@Injectable()
export class InstanceReadinessService {
  constructor(
    private readonly storage: ObjectStorageClient,
    private readonly smtp: SmtpSettingsClient,
    private readonly models: ModelListService,
  ) {}

  async snapshot(): Promise<InstanceReadinessSnapshot> {
    const items: ReadinessItemResult[] = [];
    for (const entry of READINESS_CATALOG) {
      items.push({ id: entry.id, status: await this.statusFor(entry) });
    }
    const byId = new Map(items.map((i) => [i.id, i.status]));
    const surfaces: Record<string, ReadinessSurfaceResult> = {};
    const surfaceSet = new Set<ReadinessSurface>();
    for (const entry of READINESS_CATALOG) {
      if (entry.planned) continue;
      for (const s of entry.surfaces) surfaceSet.add(s);
    }
    for (const surface of surfaceSet) {
      const required = READINESS_CATALOG.filter(
        (e) => !e.planned && e.surfaces.includes(surface),
      );
      const missing = required
        .filter((e) => byId.get(e.id) !== 'ready')
        .map((e) => e.id);
      surfaces[surface] = { ready: missing.length === 0, missing };
    }
    return { items, surfaces };
  }

  private async statusFor(entry: ReadinessCatalogEntry): Promise<ReadinessStatus> {
    if (entry.planned || entry.completion === 'planned') return 'planned';
    if (entry.completion === 'verified_integration') {
      if (entry.id === 'object_storage') return this.storage.readinessStatus();
      if (entry.id === 'mail') return this.smtp.readinessStatus();
      return 'missing';
    }
    if (entry.completion === 'available_models' && entry.taskType) {
      const list = await this.models.getAvailableModels({ taskType: entry.taskType });
      return list.length > 0 ? 'ready' : 'missing';
    }
    return 'missing';
  }
}
