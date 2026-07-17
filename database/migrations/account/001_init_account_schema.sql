-- account schema · 001 — Catalog-native provider/model foundation.
-- This Beta baseline intentionally supports fresh databases only.
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS account;
SET search_path TO account, public;

CREATE TABLE account.catalog_sources (
  source_id UUID PRIMARY KEY,
  namespace VARCHAR(200) NOT NULL UNIQUE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('official', 'local')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account.catalog_releases (
  release_id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES account.catalog_sources(source_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  schema_version VARCHAR(20) NOT NULL,
  content_digest VARCHAR(64) NOT NULL,
  bundle JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, sequence)
);

CREATE TABLE account.catalog_resources (
  resource_uid UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES account.catalog_sources(source_id) ON DELETE RESTRICT,
  kind VARCHAR(30) NOT NULL CHECK (
    kind IN ('provider', 'channel_template', 'model_offering', 'rate_card')
  ),
  slug VARCHAR(240) NOT NULL,
  head_revision INTEGER NOT NULL CHECK (head_revision > 0),
  forked_from_resource_uid UUID,
  forked_from_revision INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, kind, slug),
  CONSTRAINT ck_catalog_resource_fork_pair CHECK (
    (forked_from_resource_uid IS NULL) = (forked_from_revision IS NULL)
  )
);

CREATE TABLE account.catalog_resource_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_uid UUID NOT NULL REFERENCES account.catalog_resources(resource_uid) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  lifecycle VARCHAR(20) NOT NULL CHECK (
    lifecycle IN ('active', 'deprecated', 'retired', 'revoked')
  ),
  content_digest VARCHAR(64) NOT NULL,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(resource_uid, revision),
  UNIQUE(resource_uid, id)
);

ALTER TABLE account.catalog_resources
  ADD CONSTRAINT fk_catalog_resource_head_revision
  FOREIGN KEY(resource_uid, head_revision)
  REFERENCES account.catalog_resource_revisions(resource_uid, revision)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE account.catalog_resources
  ADD CONSTRAINT fk_catalog_resource_fork_revision
  FOREIGN KEY(forked_from_resource_uid, forked_from_revision)
  REFERENCES account.catalog_resource_revisions(resource_uid, revision) ON DELETE RESTRICT;

CREATE TABLE account.catalog_release_entries (
  release_id UUID NOT NULL REFERENCES account.catalog_releases(release_id) ON DELETE RESTRICT,
  resource_uid UUID NOT NULL REFERENCES account.catalog_resources(resource_uid) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  PRIMARY KEY(release_id, resource_uid),
  FOREIGN KEY(resource_uid, revision)
    REFERENCES account.catalog_resource_revisions(resource_uid, revision) ON DELETE RESTRICT
);

CREATE TABLE account.catalog_runtime_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  local_source_id UUID NOT NULL REFERENCES account.catalog_sources(source_id) ON DELETE RESTRICT,
  active_official_release_id UUID REFERENCES account.catalog_releases(release_id) ON DELETE RESTRICT,
  catalog_epoch BIGINT NOT NULL DEFAULT 0 CHECK (catalog_epoch >= 0),
  snapshot_digest VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account.provider_installations (
  provider_resource_uid UUID PRIMARY KEY
    REFERENCES account.catalog_resources(resource_uid) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  config_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account.channel_installations (
  channel_resource_uid UUID PRIMARY KEY
    REFERENCES account.catalog_resources(resource_uid) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 0,
  config_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account.model_settings (
  model_resource_uid UUID PRIMARY KEY
    REFERENCES account.catalog_resources(resource_uid) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  visibility VARCHAR(20) NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'internal', 'hidden')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_resource_uid UUID NOT NULL
    REFERENCES account.channel_installations(channel_resource_uid) ON DELETE RESTRICT,
  label VARCHAR(200),
  credential_type VARCHAR(30) NOT NULL
    CHECK (credential_type IN ('api_key', 'cli_session')),
  encrypted_payload BYTEA NOT NULL,
  encryption_key_id VARCHAR(100) NOT NULL,
  payload_fields TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMPTZ,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  total_usage_count BIGINT NOT NULL DEFAULT 0,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (credential_type = 'api_key' AND payload_fields = ARRAY['api_key']::TEXT[])
    OR (credential_type = 'cli_session' AND cardinality(payload_fields) = 0)
  ),
  UNIQUE(channel_resource_uid, id)
);

CREATE INDEX idx_catalog_releases_source_sequence
  ON account.catalog_releases(source_id, sequence DESC);
CREATE INDEX idx_catalog_resources_source_kind
  ON account.catalog_resources(source_id, kind);
CREATE INDEX idx_catalog_revisions_resource
  ON account.catalog_resource_revisions(resource_uid, revision DESC);
CREATE INDEX idx_catalog_release_entries_resource_revision_release
  ON account.catalog_release_entries(resource_uid, revision, release_id);
CREATE INDEX idx_provider_installations_enabled
  ON account.provider_installations(enabled, sort_order) WHERE enabled = TRUE;
CREATE INDEX idx_channel_installations_enabled
  ON account.channel_installations(enabled, priority) WHERE enabled = TRUE;
CREATE INDEX idx_model_settings_enabled
  ON account.model_settings(enabled, sort_order) WHERE enabled = TRUE;
CREATE INDEX idx_credentials_channel
  ON account.credentials(channel_resource_uid) WHERE archived_at IS NULL;
CREATE INDEX idx_credentials_enabled
  ON account.credentials(channel_resource_uid, enabled)
  WHERE enabled = TRUE AND archived_at IS NULL;

WITH local_source AS (SELECT gen_random_uuid() AS source_id)
INSERT INTO account.catalog_sources(source_id, namespace, kind)
SELECT source_id, 'local:' || source_id::text, 'local' FROM local_source;

INSERT INTO account.catalog_runtime_state(id, local_source_id)
SELECT 1, source_id FROM account.catalog_sources WHERE kind = 'local';

COMMIT;
