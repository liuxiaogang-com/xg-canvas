// YAML 配置文件类型定义 + 同步结果类型 (extracted from config-sync.service.ts).

export interface ProviderConfigFile {
  version: string;
  provider: ProviderConfig;
  channels?: ChannelConfig[];
  models?: ModelConfig[];
}

export interface ProviderConfig {
  slug: string;
  display_name: string;
  icon_url?: string;
  homepage_url?: string;
  auth_method?: string;
  base_url?: string;
  invocation_methods?: string[];
  adapter_keys?: string[];
  sdk_package?: string;
  supported_regions?: string[];
  description?: string;
  documentation_url?: string;
}

export interface ChannelConfig {
  slug: string;
  display_name: string;
  invocation_method: string;
  base_url?: string;
  request_config?: Record<string, any>;
  load_balance_strategy?: string;
  weight?: number;
  rate_limit_rpm?: number;
  rate_limit_tpm?: number;
  daily_quota?: number;
  concurrent_limit?: number;
}

export interface ModelConfig {
  model_id: string;
  provider_model_id: string;
  display_name: string;
  description?: string;
  task_types: string[];
  capabilities?: string[];
  invocation_mode?: string;
  adapter_key?: string;
  supports_streaming?: boolean;
  tags?: string[];
  deprecated?: boolean;
  deprecated_message?: string;
  allowed_channel_ids?: string[];
  allowed_channel_slugs?: string[];
  param_schema?: any;
  param_constraints?: any[];
  input_contract?: any;
  poll_policy?: Record<string, any>;
  limits?: Record<string, any>;
  pricing?: Record<string, any>;
}

export interface SchemaTemplate {
  version: string;
  template_id: string;
  display_name: string;
  schema: any;
}

export interface SyncResult {
  providers: { created: number; updated: number; skipped: number };
  channels: { created: number; updated: number; skipped: number };
  models: { created: number; updated: number; skipped: number };
  errors: string[];
}
