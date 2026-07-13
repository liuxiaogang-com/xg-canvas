-- ============================================================
-- account schema · 001 — Provider/Channel/Credential/Model + audit
-- All tables live in the dedicated `account` schema so canvas-api
-- can be split off later without renaming.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS account;
SET search_path TO account, public;

-- ------------------------------------------------------------
-- 1. providers
-- ------------------------------------------------------------
CREATE TABLE account.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  icon_url TEXT,
  homepage_url TEXT,
  base_url TEXT,
  auth_method VARCHAR(30) NOT NULL DEFAULT 'api_key',
  auth_config JSONB DEFAULT '{}'::jsonb,
  invocation_methods VARCHAR(20)[] NOT NULL DEFAULT ARRAY['http']::VARCHAR(20)[],
  adapter_keys VARCHAR(50)[] NOT NULL DEFAULT '{}',
  sdk_package VARCHAR(200),
  enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  description TEXT,
  documentation_url TEXT,
  supported_regions TEXT[] DEFAULT '{}',
  source VARCHAR(20) DEFAULT 'manual',
  config_file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_providers_slug ON account.providers(slug);
CREATE INDEX idx_providers_enabled ON account.providers(enabled) WHERE enabled = true;

COMMENT ON TABLE  account.providers IS 'AI service vendors (OpenAI, doubao, deepseek, dreamina-cli, ...)';
COMMENT ON COLUMN account.providers.slug IS 'Unique key. Different invocation methods of one vendor live as separate slugs (dreamina-api / dreamina-cli / dreamina-reverse).';
COMMENT ON COLUMN account.providers.auth_method IS 'api_key | oauth2 | cookie | cli_token | custom';
COMMENT ON COLUMN account.providers.invocation_methods IS 'Multi-value: http | sdk | cli | websocket. A provider may expose more than one.';
COMMENT ON COLUMN account.providers.adapter_keys IS 'Adapter implementations bound to this provider.';
COMMENT ON COLUMN account.providers.source IS 'manual | config_file (YAML synced)';

-- ------------------------------------------------------------
-- 2. channels (account pools / endpoints)
-- ------------------------------------------------------------
CREATE TABLE account.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES account.providers(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  invocation_method VARCHAR(20) NOT NULL,
  base_url TEXT,
  request_config JSONB DEFAULT '{}'::jsonb,
  load_balance_strategy VARCHAR(20) DEFAULT 'round_robin',
  weight INTEGER DEFAULT 100,
  rate_limit_rpm INTEGER,
  rate_limit_tpm INTEGER,
  daily_quota INTEGER,
  concurrent_limit INTEGER DEFAULT 10,
  current_daily_usage INTEGER DEFAULT 0,
  last_usage_reset_at TIMESTAMPTZ DEFAULT NOW(),
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  health_status VARCHAR(20) DEFAULT 'unknown',
  last_health_check_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  source VARCHAR(20) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, slug)
);

CREATE INDEX idx_channels_provider ON account.channels(provider_id);
CREATE INDEX idx_channels_enabled ON account.channels(enabled, priority DESC) WHERE enabled = true;

COMMENT ON TABLE  account.channels IS 'Provider channels = endpoints + account pools.';
COMMENT ON COLUMN account.channels.invocation_method IS 'http | sdk | cli | websocket';
COMMENT ON COLUMN account.channels.load_balance_strategy IS 'round_robin | least_used | random | priority | weighted';
COMMENT ON COLUMN account.channels.health_status IS 'healthy | degraded | down | unknown';

-- ------------------------------------------------------------
-- 3. credentials (AES-256-GCM payload)
-- ------------------------------------------------------------
CREATE TABLE account.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES account.channels(id) ON DELETE CASCADE,
  label VARCHAR(200),
  credential_type VARCHAR(30) NOT NULL,
  encrypted_payload BYTEA NOT NULL,
  encryption_key_id VARCHAR(100) NOT NULL,
  payload_fields TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  is_valid BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,
  expires_at TIMESTAMPTZ,
  auto_refresh BOOLEAN DEFAULT false,
  refresh_token_encrypted BYTEA,
  last_used_at TIMESTAMPTZ,
  total_usage_count BIGINT DEFAULT 0,
  source VARCHAR(20) DEFAULT 'manual',
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credentials_channel ON account.credentials(channel_id);
CREATE INDEX idx_credentials_enabled ON account.credentials(enabled, is_valid)
  WHERE enabled = true AND is_valid = true;
CREATE INDEX idx_credentials_expiry ON account.credentials(expires_at)
  WHERE expires_at IS NOT NULL AND auto_refresh = true;

COMMENT ON TABLE  account.credentials IS 'AES-256-GCM encrypted credentials.';
COMMENT ON COLUMN account.credentials.credential_type IS 'api_key | oauth_token | cookie | cli_config | keypair';
COMMENT ON COLUMN account.credentials.encrypted_payload IS '[keyId 1B][iv 12B][authTag 16B][ciphertext]';

-- ------------------------------------------------------------
-- 4. model_definitions (read-only mirror of YAML registry)
-- ------------------------------------------------------------
CREATE TABLE account.model_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES account.providers(id) ON DELETE CASCADE,
  model_id VARCHAR(200) NOT NULL UNIQUE,
  provider_model_id VARCHAR(200) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  icon_url TEXT,
  tags TEXT[] DEFAULT '{}',
  task_types TEXT[] NOT NULL,
  capabilities TEXT[] DEFAULT '{}',
  invocation_mode VARCHAR(20) NOT NULL DEFAULT 'sync',
  supports_streaming BOOLEAN DEFAULT false,
  adapter_key VARCHAR(50),
  allowed_channel_ids UUID[] DEFAULT '{}',
  -- Mirror of YAML manifest. Edited via YAML only.
  param_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  param_constraints JSONB DEFAULT '[]'::jsonb,
  input_contract JSONB DEFAULT '{}'::jsonb,
  poll_policy JSONB DEFAULT '{}'::jsonb,
  limits JSONB DEFAULT '{}'::jsonb,
  pricing JSONB DEFAULT '{}'::jsonb,
  -- Operational fields (DB is authoritative for these)
  enabled BOOLEAN DEFAULT true,
  visibility VARCHAR(20) DEFAULT 'public',
  daily_quota INTEGER,
  deprecated BOOLEAN DEFAULT false,
  deprecated_message TEXT,
  sort_order INTEGER DEFAULT 0,
  source VARCHAR(20) DEFAULT 'yaml',
  source_version VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_models_provider ON account.model_definitions(provider_id);
CREATE INDEX idx_models_model_id ON account.model_definitions(model_id);
CREATE INDEX idx_models_task_types ON account.model_definitions USING GIN(task_types);
CREATE INDEX idx_models_capabilities ON account.model_definitions USING GIN(capabilities);
CREATE INDEX idx_models_enabled ON account.model_definitions(enabled, sort_order) WHERE enabled = true;

COMMENT ON TABLE  account.model_definitions IS 'Mirror of YAML manifests. param_schema/constraints come from YAML; enabled/visibility/quota are operational.';
COMMENT ON COLUMN account.model_definitions.adapter_key IS 'Routing key into apps/account-api/src/adapters registry.';
COMMENT ON COLUMN account.model_definitions.poll_policy IS 'Async polling parameters (interval_ms, max_attempts, backoff).';
COMMENT ON COLUMN account.model_definitions.visibility IS 'public | internal | hidden';

-- ------------------------------------------------------------
-- 5. model_channel_mappings
-- ------------------------------------------------------------
CREATE TABLE account.model_channel_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_def_id UUID NOT NULL REFERENCES account.model_definitions(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES account.channels(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  config_overrides JSONB DEFAULT '{}'::jsonb,
  UNIQUE(model_def_id, channel_id)
);

COMMENT ON TABLE account.model_channel_mappings IS 'Model ↔ Channel routing (many-to-many).';

-- ------------------------------------------------------------
-- 6. encryption_keys
-- ------------------------------------------------------------
CREATE TABLE account.encryption_keys (
  id VARCHAR(100) PRIMARY KEY,
  algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  retired_at TIMESTAMPTZ,
  credential_count INTEGER DEFAULT 0
);

COMMENT ON TABLE  account.encryption_keys IS 'Key registry only; secret material lives in the API keyring volume or an external secret source.';
COMMENT ON COLUMN account.encryption_keys.status IS 'active | rotating | retired';

-- ------------------------------------------------------------
-- 7. audit_logs
-- ------------------------------------------------------------
CREATE TABLE account.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(30) NOT NULL,
  changes JSONB,
  actor_id VARCHAR(100),
  actor_type VARCHAR(20) DEFAULT 'admin',
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON account.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_time   ON account.audit_logs(created_at DESC);

COMMENT ON COLUMN account.audit_logs.entity_type IS 'provider | channel | credential | model';
COMMENT ON COLUMN account.audit_logs.action      IS 'create | update | delete | enable | disable | validate';

-- ------------------------------------------------------------
-- Seed: encryption key v1
-- ------------------------------------------------------------
INSERT INTO account.encryption_keys (id, algorithm, status)
VALUES ('v1', 'aes-256-gcm', 'active')
ON CONFLICT (id) DO NOTHING;

COMMIT;
