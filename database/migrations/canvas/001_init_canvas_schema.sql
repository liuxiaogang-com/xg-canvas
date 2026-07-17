-- ============================================================
-- canvas schema · 001 — Users / Workspaces / Projects / Canvas /
-- Tasks / Assets / Presets / Entities
-- See docs/architecture.md §4.2 + docs/task-lifecycle.md §1.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS canvas;
SET search_path TO canvas, public;

-- ------------------------------------------------------------
-- 1. users
-- ------------------------------------------------------------
CREATE TABLE canvas.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT,                      -- nullable for SSO-only accounts
  feishu_union_id VARCHAR(100) UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  avatar_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | disabled
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. workspaces + members
-- ------------------------------------------------------------
CREATE TABLE canvas.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  owner_id UUID NOT NULL REFERENCES canvas.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE canvas.workspace_members (
  workspace_id UUID NOT NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES canvas.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',   -- owner | admin | member | viewer
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_workspace_members_user ON canvas.workspace_members(user_id);

-- ------------------------------------------------------------
-- 3. projects (1:1 with canvases)
-- ------------------------------------------------------------
CREATE TABLE canvas.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  cover_url TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES canvas.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_projects_workspace ON canvas.projects(workspace_id);

-- ------------------------------------------------------------
-- 4. canvases (M3 starts using these — tables exist now)
-- ------------------------------------------------------------
CREATE TABLE canvas.canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES canvas.projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL DEFAULT 'main',
  viewport JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  last_modified_by UUID REFERENCES canvas.users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE canvas.canvas_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES canvas.canvases(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  position JSONB NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout_zones JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_canvas_nodes_canvas ON canvas.canvas_nodes(canvas_id);

CREATE TABLE canvas.canvas_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES canvas.canvases(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES canvas.canvas_nodes(id) ON DELETE CASCADE,
  source_handle VARCHAR(50) NOT NULL,
  target_node_id UUID NOT NULL REFERENCES canvas.canvas_nodes(id) ON DELETE CASCADE,
  target_handle VARCHAR(50) NOT NULL,
  data_type VARCHAR(50) NOT NULL,                -- IO type / entity_ref:<kind>
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_canvas_edges_canvas ON canvas.canvas_edges(canvas_id);

CREATE TABLE canvas.canvas_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES canvas.canvases(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canvas_id, version)
);

-- ------------------------------------------------------------
-- 5. tasks
-- ------------------------------------------------------------
CREATE TABLE canvas.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(60) NOT NULL,                      -- gen.text / gen.image / ...
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled')),
  model_id VARCHAR(200) NOT NULL,
  model_resource_uid UUID NOT NULL,
  model_revision_id UUID NOT NULL,
  rate_card_revision_id UUID,
  catalog_epoch BIGINT NOT NULL CHECK (catalog_epoch >= 0),
  external_task_id VARCHAR(200),
  invoke_request_id UUID,
  invoke_logical_request_id UUID,
  invoke_prepared_at TIMESTAMPTZ,
  channel_resource_uid UUID REFERENCES account.channel_installations(channel_resource_uid) ON DELETE RESTRICT,
  channel_revision_id UUID,
  channel_route JSONB,
  credential_id UUID REFERENCES account.credentials(id) ON DELETE RESTRICT,
  source_node_id UUID REFERENCES canvas.canvas_nodes(id) ON DELETE SET NULL,
  project_id UUID REFERENCES canvas.projects(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES canvas.users(id) ON DELETE RESTRICT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_asset_ids UUID[] NOT NULL DEFAULT '{}',
  text_output TEXT,
  json_output JSONB,
  progress REAL,
  error JSONB,
  retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  attempt_no INT NOT NULL DEFAULT 0 CHECK (attempt_no >= 0),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  next_poll_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_tasks_model_catalog_revision
    FOREIGN KEY(model_resource_uid, model_revision_id)
    REFERENCES account.catalog_resource_revisions(resource_uid, id) ON DELETE RESTRICT,
  CONSTRAINT fk_tasks_rate_catalog_revision
    FOREIGN KEY(rate_card_revision_id)
    REFERENCES account.catalog_resource_revisions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tasks_credential_channel
    FOREIGN KEY(channel_resource_uid, credential_id)
    REFERENCES account.credentials(channel_resource_uid, id) ON DELETE RESTRICT,
  CONSTRAINT fk_tasks_channel_catalog_revision
    FOREIGN KEY(channel_resource_uid, channel_revision_id)
    REFERENCES account.catalog_resource_revisions(resource_uid, id) ON DELETE RESTRICT,
  CONSTRAINT ck_tasks_credential_channel_pair CHECK (
    (channel_resource_uid IS NULL AND channel_revision_id IS NULL AND channel_route IS NULL AND credential_id IS NULL)
    OR (channel_resource_uid IS NOT NULL AND channel_revision_id IS NOT NULL AND channel_route IS NOT NULL AND credential_id IS NOT NULL)
  ),
  CONSTRAINT ck_tasks_invoke_logical_pair CHECK (
    (invoke_logical_request_id IS NULL AND invoke_prepared_at IS NULL)
    OR (invoke_logical_request_id IS NOT NULL AND invoke_prepared_at IS NOT NULL)
  ),
  CONSTRAINT ck_tasks_external_correlation CHECK (
    (external_task_id IS NULL AND invoke_request_id IS NULL)
    OR (
      external_task_id IS NOT NULL AND invoke_request_id IS NOT NULL
      AND invoke_logical_request_id IS NOT NULL
    )
  ),
  CONSTRAINT ck_tasks_lease_pair CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT ck_tasks_terminal_no_lease CHECK (
    status NOT IN ('succeeded', 'failed', 'cancelled') OR lease_token IS NULL
  )
);
CREATE INDEX idx_tasks_status_created ON canvas.tasks(status, created_at);
CREATE INDEX idx_tasks_owner_status ON canvas.tasks(owner_id, status, created_at DESC);
CREATE INDEX idx_tasks_project ON canvas.tasks(project_id);
CREATE INDEX idx_tasks_model_revision ON canvas.tasks(model_revision_id);
CREATE INDEX idx_tasks_invoke_logical ON canvas.tasks(invoke_logical_request_id)
  WHERE invoke_logical_request_id IS NOT NULL;
CREATE INDEX idx_tasks_running_poll ON canvas.tasks(status, next_poll_at)
  WHERE status IN ('queued','running');
CREATE INDEX idx_tasks_invoke_claim
  ON canvas.tasks(status, next_poll_at, lease_expires_at, created_at)
  WHERE external_task_id IS NULL;
CREATE INDEX idx_tasks_poll_claim
  ON canvas.tasks(next_poll_at, lease_expires_at)
  WHERE status = 'running' AND external_task_id IS NOT NULL;

-- ------------------------------------------------------------
-- 6. assets
-- ------------------------------------------------------------
CREATE TABLE canvas.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL,                       -- image|video|audio|text|json
  scope VARCHAR(20) NOT NULL DEFAULT 'project',    -- workspace|project
  workspace_id UUID NOT NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES canvas.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES canvas.users(id) ON DELETE RESTRICT,
  task_id UUID REFERENCES canvas.tasks(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL,
  bucket VARCHAR(100) NOT NULL DEFAULT 'xgcanvas-assets',
  origin_url TEXT,
  thumb_storage_key TEXT,
  mime_type VARCHAR(100) NOT NULL,
  bytes BIGINT NOT NULL,
  width INT,
  height INT,
  duration_ms INT,
  checksum_sha256 VARCHAR(64),
  name VARCHAR(200),
  tags TEXT[] NOT NULL DEFAULT '{}',
  role VARCHAR(50),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_assets_project_created ON canvas.assets(project_id, created_at DESC);
CREATE INDEX idx_assets_workspace_created ON canvas.assets(workspace_id, created_at DESC);
CREATE INDEX idx_assets_checksum ON canvas.assets(checksum_sha256);
CREATE UNIQUE INDEX uk_assets_task_storage
  ON canvas.assets(task_id, storage_key)
  WHERE task_id IS NOT NULL AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- 7. prompt_presets
-- ------------------------------------------------------------
CREATE TABLE canvas.prompt_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(10) NOT NULL,                      -- system | user
  owner_id UUID REFERENCES canvas.users(id) ON DELETE CASCADE,
  task_type VARCHAR(60) NOT NULL,                  -- gen.text|gen.image|...
  title VARCHAR(200) NOT NULL,
  content JSONB NOT NULL,                          -- {role, text} list
  tags TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scope IN ('system','user')),
  CHECK (scope = 'system' OR owner_id IS NOT NULL)
);
CREATE INDEX idx_presets_task_scope ON canvas.prompt_presets(task_type, scope);
CREATE INDEX idx_presets_owner ON canvas.prompt_presets(owner_id);

-- ------------------------------------------------------------
-- 8. entities (M4 fills these in; the table exists so M3 edges can FK)
-- ------------------------------------------------------------
CREATE TABLE canvas.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES canvas.projects(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,                       -- character | scene | prop | storyboard
  name VARCHAR(200) NOT NULL,
  description TEXT,
  ref_asset_ids UUID[] NOT NULL DEFAULT '{}',
  generated_asset_id UUID REFERENCES canvas.assets(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_entities_project_type ON canvas.entities(project_id, type);

COMMIT;
