import type { ModelParamSchema, ParamConstraint } from '@xgcanvas/constraint-engine';
import type {
  Capability,
  ModelInputContract,
  ProviderAuthMethod,
  TaskType,
} from '@xgcanvas/shared-types';

export const CATALOG_BUNDLE_FORMAT = 'xgcanvas.catalog.bundle' as const;
export const CATALOG_SCHEMA_VERSION = '1' as const;

export const CATALOG_RESOURCE_KINDS = [
  'provider',
  'channel_template',
  'model_offering',
  'rate_card',
] as const;
export type CatalogResourceKind = (typeof CATALOG_RESOURCE_KINDS)[number];

export const CATALOG_LIFECYCLES = ['active', 'deprecated', 'retired', 'revoked'] as const;
export type CatalogLifecycle = (typeof CATALOG_LIFECYCLES)[number];

export function isCatalogCurrentLifecycle(value: CatalogLifecycle): boolean {
  return value === 'active' || value === 'deprecated';
}

export function isCatalogTerminalLifecycle(
  value: CatalogLifecycle,
): value is 'retired' | 'revoked' {
  return value === 'retired' || value === 'revoked';
}

export interface CatalogSourceDescriptor {
  source_id: string;
  namespace: string;
  kind: 'official' | 'local';
}

export interface CatalogReleaseDescriptor {
  release_id: string;
  sequence: number;
  published_at: string;
  min_runtime_version?: string;
}

export interface CatalogResourceBase {
  resource_uid: string;
  revision: number;
  slug: string;
  lifecycle: CatalogLifecycle;
}

export interface CatalogProvider extends CatalogResourceBase {
  kind: 'provider';
  display_name: string;
  icon_url?: string;
  homepage_url?: string;
  documentation_url?: string;
  description?: string;
  auth_method: ProviderAuthMethod;
  auth_config?: Record<string, unknown>;
  base_url?: string;
  invocation_methods: string[];
  adapter_keys: string[];
  sdk_package?: string;
  supported_regions: string[];
}

export interface CatalogChannelTemplate extends CatalogResourceBase {
  kind: 'channel_template';
  provider_uid: string;
  display_name: string;
  invocation_method: string;
  adapter_keys: string[];
  base_url?: string;
  request_config: Record<string, unknown>;
}

export interface CatalogPollPolicy {
  initial_delay_ms: number;
  interval_ms: number;
  max_total_ms: number;
}

export interface CatalogModelOffering extends CatalogResourceBase {
  kind: 'model_offering';
  provider_uid: string;
  model_id: string;
  provider_model_id: string;
  display_name: string;
  description?: string;
  icon_url?: string;
  task_types: TaskType[];
  capabilities: Capability[];
  invocation_mode: 'sync' | 'async' | 'stream';
  adapter_key: string;
  supports_streaming: boolean;
  allowed_channel_uids: string[];
  tags: string[];
  param_schema: ModelParamSchema;
  param_constraints: ParamConstraint[];
  input_contract?: ModelInputContract;
  poll_policy?: CatalogPollPolicy;
  limits: Record<string, unknown>;
  rate_card_uid?: string;
  deprecated_message?: string;
}

export interface CatalogRateCard extends CatalogResourceBase {
  kind: 'rate_card';
  model_uid: string;
  effective_from?: string;
  pricing: Record<string, unknown>;
}

export interface CatalogBundleV1 {
  format: typeof CATALOG_BUNDLE_FORMAT;
  schema_version: typeof CATALOG_SCHEMA_VERSION;
  source: CatalogSourceDescriptor;
  release: CatalogReleaseDescriptor;
  providers: CatalogProvider[];
  channel_templates: CatalogChannelTemplate[];
  model_offerings: CatalogModelOffering[];
  rate_cards: CatalogRateCard[];
}

export interface CatalogCompilation {
  bundle: CatalogBundleV1;
  canonical_json: string;
  content_digest: string;
}

export interface CatalogReleaseAuthoring {
  format: 'xgcanvas.catalog.authoring';
  schema_version: typeof CATALOG_SCHEMA_VERSION;
  source: CatalogSourceDescriptor;
  release: CatalogReleaseDescriptor;
}

export interface AuthoringResourceIdentity {
  resource_uid: string;
  revision: number;
  lifecycle?: CatalogLifecycle;
}

export interface ProviderAuthoring extends AuthoringResourceIdentity {
  slug: string;
  display_name: string;
  icon_url?: string;
  homepage_url?: string;
  documentation_url?: string;
  description?: string;
  auth_method?: ProviderAuthMethod;
  auth_config?: Record<string, unknown>;
  base_url?: string;
  invocation_methods?: string[];
  adapter_keys: string[];
  sdk_package?: string;
  supported_regions?: string[];
}

export interface ChannelAuthoring extends AuthoringResourceIdentity {
  slug: string;
  display_name: string;
  invocation_method: string;
  adapter_keys: string[];
  base_url?: string;
  request_config?: Record<string, unknown>;
}

export interface RateCardAuthoring extends AuthoringResourceIdentity {
  slug: string;
  model_id: string;
  effective_from?: string;
  pricing: Record<string, unknown>;
}

export interface InlineRateCardAuthoring extends AuthoringResourceIdentity {
  slug?: string;
  effective_from?: string;
  currency: string;
  components: Array<{
    meter: string;
    per: number;
    price: number;
  }>;
}

export interface ModelAuthoring extends AuthoringResourceIdentity {
  model_id: string;
  provider_model_id: string;
  display_name: string;
  description?: string;
  icon_url?: string;
  task_types: string[];
  capabilities?: string[];
  invocation_mode?: 'sync' | 'async' | 'stream';
  adapter_key: string;
  supports_streaming?: boolean;
  allowed_channel_slugs: string[];
  tags?: string[];
  param_schema?: unknown;
  param_constraints?: unknown[];
  input_contract?: unknown;
  poll_policy?: CatalogPollPolicy;
  limits?: Record<string, unknown>;
  pricing?: InlineRateCardAuthoring;
  deprecated_message?: string;
}

export interface ProviderAuthoringDocument {
  file_path: string;
  version?: string;
  provider?: ProviderAuthoring;
  provider_slug?: string;
  channels?: ChannelAuthoring[];
  models?: ModelAuthoring[];
  rate_cards?: RateCardAuthoring[];
}

export interface SchemaTemplateAuthoring {
  template_id: string;
  schema: unknown;
}

export interface CatalogCompilerInput {
  release: CatalogReleaseAuthoring;
  documents: ProviderAuthoringDocument[];
  templates: ReadonlyMap<string, unknown>;
}

export interface CatalogCompilerOptions {
  known_adapter_keys?: ReadonlySet<string>;
  adapter_task_types?: ReadonlyMap<string, readonly TaskType[]>;
}
