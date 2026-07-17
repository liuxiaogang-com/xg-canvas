-- ============================================================
-- ops schema · 001 — request_logs (vendor-API request observability)
-- Separate schema on purpose: high write volume, retention-cleaned,
-- different lifecycle than business data. NO cross-schema FKs (so it can be
-- truncated / partitioned / moved to a dedicated store without touching
-- canvas/account). Secrets are NEVER stored — credentials by label/id only.
-- See docs/architecture.md §4.
-- ============================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
SET search_path TO ops, public;

CREATE TABLE ops.request_logs (
  id               UUID PRIMARY KEY,  -- caller-generated request id surfaced to users
  logical_request_id UUID,
  attempt_no       INTEGER CHECK (attempt_no IS NULL OR attempt_no >= 1),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,

  -- ---- dimensions (denormalized for fast filtering; nullable for system/admin calls) ----
  source           VARCHAR(20)  NOT NULL DEFAULT 'invoke',  -- invoke | poll | cancel
  operation        VARCHAR(60),                             -- e.g. chat.completions | models.list
  workspace_id     UUID,
  owner_id         UUID,
  project_id       UUID,
  task_id          VARCHAR(120),   -- string: synthetic ids (agent turns) as well as canvas.tasks UUIDs
  conversation_id  UUID,
  provider_slug    VARCHAR(60),
  model_id         VARCHAR(200),
  model_resource_uid UUID,
  model_revision_id UUID,
  rate_card_revision_id UUID,
  catalog_epoch    BIGINT,
  adapter_key      VARCHAR(60),
  channel_resource_uid UUID,
  channel_revision_id UUID,
  channel_route    JSONB,
  credential_id    UUID,
  credential_label VARCHAR(200),   -- so a log reads "A-deepseek" without a join

  -- ---- outcome ----
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | success | error | timeout | cancelled
  http_status      INTEGER,
  latency_ms       INTEGER,

  -- ---- detail (sanitized; no secrets) ----
  request_summary  JSONB,          -- model / temperature / message_count / max_tokens / thinking ...
  usage            JSONB,          -- token meters when available
  cost             NUMERIC(14, 6), -- frozen from the pinned immutable Rate Card revision
  cost_currency    VARCHAR(10),
  error_code       VARCHAR(60),
  error_message    TEXT,
  vendor_error     JSONB,          -- raw vendor error body — fuel for AI analysis
  request_body     JSONB,          -- optional full body, off by default (sanitized)
  response_body    JSONB,          -- optional full body, off by default

  CONSTRAINT ck_request_logs_catalog_pin CHECK (
    (model_resource_uid IS NULL AND model_revision_id IS NULL AND catalog_epoch IS NULL)
    OR (model_resource_uid IS NOT NULL AND model_revision_id IS NOT NULL AND catalog_epoch IS NOT NULL)
  ),
  CONSTRAINT ck_request_logs_catalog_epoch CHECK (
    catalog_epoch IS NULL OR catalog_epoch >= 0
  ),
  CONSTRAINT ck_request_logs_source CHECK (
    source IN ('invoke', 'poll', 'cancel')
  ),
  CONSTRAINT ck_request_logs_status CHECK (
    status IN ('pending', 'success', 'error', 'timeout', 'cancelled')
  ),
  CONSTRAINT ck_request_logs_finished_at CHECK (
    (status = 'pending' AND finished_at IS NULL)
    OR (status <> 'pending' AND finished_at IS NOT NULL)
  ),
  CONSTRAINT ck_request_logs_attempt_shape CHECK (
    (attempt_no IS NULL AND status <> 'pending') OR (
      attempt_no IS NOT NULL
      AND attempt_no >= 1
      AND logical_request_id IS NOT NULL
      AND workspace_id IS NOT NULL
      AND task_id IS NOT NULL
      AND model_id IS NOT NULL
      AND model_resource_uid IS NOT NULL
      AND model_revision_id IS NOT NULL
      AND catalog_epoch IS NOT NULL
      AND adapter_key IS NOT NULL
      AND channel_resource_uid IS NOT NULL
      AND channel_revision_id IS NOT NULL
      AND channel_route IS NOT NULL
      AND credential_id IS NOT NULL
    )
  )
);

CREATE INDEX idx_request_logs_created   ON ops.request_logs (created_at DESC);
CREATE UNIQUE INDEX idx_request_logs_logical_attempt
  ON ops.request_logs (logical_request_id, attempt_no)
  WHERE logical_request_id IS NOT NULL AND attempt_no IS NOT NULL;
CREATE INDEX idx_request_logs_owner     ON ops.request_logs (owner_id, created_at DESC);
CREATE INDEX idx_request_logs_status    ON ops.request_logs (status, created_at DESC);
CREATE INDEX idx_request_logs_provider  ON ops.request_logs (provider_slug, created_at DESC);
CREATE INDEX idx_request_logs_model     ON ops.request_logs (model_id, created_at DESC);
CREATE INDEX idx_request_logs_model_revision ON ops.request_logs (model_revision_id)
  WHERE model_revision_id IS NOT NULL;
CREATE INDEX idx_request_logs_rate_revision ON ops.request_logs (rate_card_revision_id)
  WHERE rate_card_revision_id IS NOT NULL;
CREATE INDEX idx_request_logs_task      ON ops.request_logs (task_id);
CREATE INDEX request_logs_billing_idx
  ON ops.request_logs (model_id, owner_id, project_id)
  WHERE cost IS NOT NULL;

COMMENT ON TABLE ops.request_logs IS
  'Vendor API request observability log. High-volume, retention-cleaned. Secrets never stored (credential by label/id only). request id = id, surfaced to users on error.';

COMMIT;
