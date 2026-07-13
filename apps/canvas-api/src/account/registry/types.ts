import type { ModelManifestEntry, ModelRegistryEntry } from '@xgcanvas/adapters-contract';
import type { TaskType } from '@xgcanvas/shared-types';

export type { ModelManifestEntry, ModelRegistryEntry };

export interface RegistrySnapshot {
  /** Map of model_id -> entry. */
  byId: ReadonlyMap<string, ModelRegistryEntry>;
  /** task_type -> entries supporting it. */
  byTaskType: ReadonlyMap<TaskType, readonly ModelRegistryEntry[]>;
  /** Provider-key -> entries. */
  byProvider: ReadonlyMap<string, readonly ModelRegistryEntry[]>;
  loaded_at: string;
}

export interface ReloadReport {
  loaded: number;
  errors: string[];
  /** Provider yaml files visited. */
  files: string[];
}
