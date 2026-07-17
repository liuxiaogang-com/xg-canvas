import type {
  ModelManifestEntry,
  ModelRegistryEntry as AdapterModelRegistryEntry,
} from '@xgcanvas/adapters-contract';
import type {
  CatalogChannelTemplate,
  CatalogModelOffering,
  CatalogProvider,
} from '@xgcanvas/model-catalog';
import type { CatalogOrigin, ModelRevisionPin, TaskType } from '@xgcanvas/shared-types';

export type { ModelManifestEntry };

export interface CatalogRuntimeRateCard {
  resource_uid: string;
  model_resource_uid: string;
  revision: number;
  revision_id: string;
  pricing: Record<string, unknown>;
}

export interface ModelRegistryEntry extends AdapterModelRegistryEntry {
  document: CatalogModelOffering;
  origin: CatalogOrigin;
  pin: ModelRevisionPin;
  provider_resource_uid: string;
  rate_card_resource_uid: string | null;
  allowed_channel_resource_uids: readonly string[];
}

export interface CatalogRuntimeProvider {
  document: CatalogProvider;
  origin: CatalogOrigin;
  enabled: boolean;
  sort_order: number;
  config_overrides: Readonly<Record<string, unknown>>;
}

export interface CatalogRuntimeChannel {
  document: CatalogChannelTemplate;
  origin: CatalogOrigin;
  enabled: boolean;
  priority: number;
  config_overrides: Readonly<Record<string, unknown>>;
  enabled_credential_ids: readonly string[];
}

export interface RegistrySnapshot {
  /** Map of model_id -> entry. */
  byId: ReadonlyMap<string, ModelRegistryEntry>;
  /** Immutable model revision id -> historical/runtime entry. */
  byRevisionId: ReadonlyMap<string, ModelRegistryEntry>;
  providersByResourceUid: ReadonlyMap<string, CatalogRuntimeProvider>;
  channelsByResourceUid: ReadonlyMap<string, CatalogRuntimeChannel>;
  /** Immutable rate-card revision id -> pricing snapshot. */
  rateCardsByRevisionId: ReadonlyMap<string, CatalogRuntimeRateCard>;
  /** task_type -> entries supporting it. */
  byTaskType: ReadonlyMap<TaskType, readonly ModelRegistryEntry[]>;
  /** Provider-key -> entries. */
  byProvider: ReadonlyMap<string, readonly ModelRegistryEntry[]>;
  loaded_at: string;
  catalog_epoch: string;
  content_digest: string;
}

export interface ReloadReport {
  loaded: number;
  errors: string[];
  /** Compiled Catalog bundle files visited. */
  files: string[];
  release_id?: string;
  catalog_epoch?: string;
  content_digest?: string;
  resources?: { providers: number; channels: number; models: number; rate_cards: number };
}
