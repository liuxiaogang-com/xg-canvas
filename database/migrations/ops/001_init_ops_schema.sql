-- ============================================================
-- ops schema · 001 — request_logs (vendor-API request observability)
-- Separate schema on purpose: high write volume, retention-cleaned,
-- different lifecycle than business data. NO cross-schema FKs (so it can be
-- truncated / partitioned / moved to a dedicated store without touching
-- canvas/account). Secrets are NEVER stored — credentials by label/id only.
-- See docs/architecture.md §4.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS ops;
SET search_path TO ops, public;

CREATE TABLE ops.request_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- = request id surfaced to users
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,

  -- ---- dimensions (denormalized for fast filtering; nullable for system/admin calls) ----
  source           VARCHAR(20)  NOT NULL DEFAULT 'invoke',  -- invoke | chat | validate | list_models | get_status | admin
  operation        VARCHAR(60),                             -- e.g. chat.completions | models.list
  workspace_id     UUID,
  owner_id         UUID,
  project_id       UUID,
  task_id          VARCHAR(120),   -- string: synthetic ids (agent turns) as well as canvas.tasks UUIDs
  conversation_id  UUID,
  provider_slug    VARCHAR(60),
  model_id         VARCHAR(120),
  adapter_key      VARCHAR(60),
  channel_id       UUID,
  credential_id    UUID,
  credential_label VARCHAR(200),   -- so a log reads "A-deepseek" without a join

  -- ---- outcome ----
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | success | error | timeout | cancelled
  http_status      INTEGER,
  latency_ms       INTEGER,

  -- ---- detail (sanitized; no secrets) ----
  request_summary  JSONB,          -- model / temperature / message_count / max_tokens / thinking ...
  usage            JSONB,          -- token meters when available
  error_code       VARCHAR(60),
  error_message    TEXT,
  vendor_error     JSONB,          -- raw vendor error body — fuel for AI analysis
  request_body     JSONB,          -- optional full body, off by default (sanitized)
  response_body    JSONB           -- optional full body, off by default
);

CREATE INDEX idx_request_logs_created   ON ops.request_logs (created_at DESC);
CREATE INDEX idx_request_logs_owner     ON ops.request_logs (owner_id, created_at DESC);
CREATE INDEX idx_request_logs_status    ON ops.request_logs (status, created_at DESC);
CREATE INDEX idx_request_logs_provider  ON ops.request_logs (provider_slug, created_at DESC);
CREATE INDEX idx_request_logs_model     ON ops.request_logs (model_id, created_at DESC);
CREATE INDEX idx_request_logs_task      ON ops.request_logs (task_id);

COMMENT ON TABLE ops.request_logs IS
  'Vendor API request observability log. High-volume, retention-cleaned. Secrets never stored (credential by label/id only). request id = id, surfaced to users on error.';

COMMIT;
