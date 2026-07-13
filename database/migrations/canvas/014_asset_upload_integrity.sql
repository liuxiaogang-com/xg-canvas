-- ============================================================
-- canvas schema · 014 — Durable direct-upload intents and
-- asset/library integrity guards.
-- ============================================================
BEGIN;

-- Composite keys let child rows prove that a project/asset belongs to the
-- same workspace, rather than relying only on service-layer checks.
ALTER TABLE canvas.projects
  ADD CONSTRAINT uk_projects_id_workspace UNIQUE (id, workspace_id);

ALTER TABLE canvas.assets
  ADD CONSTRAINT uk_assets_id_workspace UNIQUE (id, workspace_id);

CREATE TABLE canvas.asset_upload_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES canvas.users(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE,
  project_id UUID,
  visibility VARCHAR(20) NOT NULL,
  type VARCHAR(20) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  bytes BIGINT NOT NULL,
  name VARCHAR(200),
  storage_key TEXT NOT NULL UNIQUE,
  thumb_storage_key TEXT UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_asset_upload_drafts_type
    CHECK (type IN ('image', 'video', 'audio', 'text', 'json')),
  CONSTRAINT ck_asset_upload_drafts_visibility
    CHECK (visibility IN ('private', 'project', 'workspace')),
  CONSTRAINT ck_asset_upload_drafts_project_visibility
    CHECK (visibility <> 'project' OR project_id IS NOT NULL),
  CONSTRAINT ck_asset_upload_drafts_metadata
    CHECK (btrim(mime_type) <> '' AND bytes > 0 AND bytes <= 536870912),
  CONSTRAINT ck_asset_upload_drafts_status
    CHECK (status IN ('pending', 'completed', 'expired')),
  CONSTRAINT fk_asset_upload_drafts_project_workspace
    FOREIGN KEY (project_id, workspace_id)
    REFERENCES canvas.projects(id, workspace_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_asset_upload_drafts_expiry
  ON canvas.asset_upload_drafts(status, expires_at)
  WHERE status = 'pending';
CREATE INDEX idx_asset_upload_drafts_owner
  ON canvas.asset_upload_drafts(owner_id, created_at DESC);

ALTER TABLE canvas.assets
  ADD COLUMN upload_draft_id UUID
    REFERENCES canvas.asset_upload_drafts(id) ON DELETE RESTRICT;

-- Includes soft-deleted rows: one intent may only ever materialize one row.
CREATE UNIQUE INDEX uk_assets_upload_draft_id
  ON canvas.assets(upload_draft_id)
  WHERE upload_draft_id IS NOT NULL;

ALTER TABLE canvas.assets
  ADD CONSTRAINT ck_assets_type CHECK (
    type IN ('image', 'video', 'audio', 'text', 'json')
  ) NOT VALID,
  ADD CONSTRAINT ck_assets_scope CHECK (
    scope IN ('workspace', 'project')
  ) NOT VALID,
  ADD CONSTRAINT ck_assets_visibility CHECK (
    visibility IN ('private', 'project', 'workspace')
  ) NOT VALID,
  ADD CONSTRAINT ck_assets_scope_project CHECK (
    (scope = 'project' AND project_id IS NOT NULL)
    OR (scope = 'workspace' AND project_id IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT ck_assets_project_visibility CHECK (
    visibility <> 'project' OR project_id IS NOT NULL
  ) NOT VALID,
  ADD CONSTRAINT ck_assets_storage_metadata CHECK (
    btrim(storage_key) <> ''
    AND btrim(mime_type) <> ''
    AND bytes >= 0
    AND (width IS NULL OR width > 0)
    AND (height IS NULL OR height > 0)
    AND (duration_ms IS NULL OR duration_ms >= 0)
  ) NOT VALID,
  ADD CONSTRAINT ck_assets_checksum_sha256 CHECK (
    checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
  ) NOT VALID,
  ADD CONSTRAINT fk_assets_project_workspace
    FOREIGN KEY (project_id, workspace_id)
    REFERENCES canvas.projects(id, workspace_id)
    ON DELETE CASCADE
    NOT VALID;

ALTER TABLE canvas.library_entries
  ADD CONSTRAINT ck_library_entries_scope CHECK (
    scope IN ('workspace', 'project')
  ) NOT VALID,
  ADD CONSTRAINT ck_library_entries_visibility CHECK (
    visibility IN ('private', 'project', 'workspace')
  ) NOT VALID,
  ADD CONSTRAINT ck_library_entries_scope_project CHECK (
    (scope = 'project' AND project_id IS NOT NULL)
    OR (scope = 'workspace' AND project_id IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT ck_library_entries_project_visibility CHECK (
    visibility <> 'project' OR project_id IS NOT NULL
  ) NOT VALID,
  ADD CONSTRAINT ck_library_entries_identity CHECK (
    btrim(kind) <> '' AND btrim(name) <> ''
  ) NOT VALID,
  ADD CONSTRAINT ck_library_entries_material_shape CHECK (
    material IS NULL OR (
      jsonb_typeof(material) = 'object'
      AND (NOT material ? 'asset_ids' OR jsonb_typeof(material -> 'asset_ids') = 'array')
    )
  ) NOT VALID,
  ADD CONSTRAINT ck_library_entries_provider_refs_shape CHECK (
    jsonb_typeof(provider_refs) = 'array'
  ) NOT VALID,
  ADD CONSTRAINT fk_library_project_workspace
    FOREIGN KEY (project_id, workspace_id)
    REFERENCES canvas.projects(id, workspace_id)
    ON DELETE CASCADE
    NOT VALID,
  ADD CONSTRAINT fk_library_cover_workspace
    FOREIGN KEY (cover_asset_id, workspace_id)
    REFERENCES canvas.assets(id, workspace_id)
    ON DELETE SET NULL (cover_asset_id)
    NOT VALID;

ALTER TABLE canvas.favorites
  ADD CONSTRAINT ck_favorites_target_type CHECK (
    target_type IN ('asset', 'library_entry', 'entity')
  ) NOT VALID;

ALTER TABLE canvas.assets
  VALIDATE CONSTRAINT ck_assets_type,
  VALIDATE CONSTRAINT ck_assets_scope,
  VALIDATE CONSTRAINT ck_assets_visibility,
  VALIDATE CONSTRAINT ck_assets_scope_project,
  VALIDATE CONSTRAINT ck_assets_project_visibility,
  VALIDATE CONSTRAINT ck_assets_storage_metadata,
  VALIDATE CONSTRAINT ck_assets_checksum_sha256,
  VALIDATE CONSTRAINT fk_assets_project_workspace;

ALTER TABLE canvas.library_entries
  VALIDATE CONSTRAINT ck_library_entries_scope,
  VALIDATE CONSTRAINT ck_library_entries_visibility,
  VALIDATE CONSTRAINT ck_library_entries_scope_project,
  VALIDATE CONSTRAINT ck_library_entries_project_visibility,
  VALIDATE CONSTRAINT ck_library_entries_identity,
  VALIDATE CONSTRAINT ck_library_entries_material_shape,
  VALIDATE CONSTRAINT ck_library_entries_provider_refs_shape,
  VALIDATE CONSTRAINT fk_library_project_workspace,
  VALIDATE CONSTRAINT fk_library_cover_workspace;

ALTER TABLE canvas.favorites
  VALIDATE CONSTRAINT ck_favorites_target_type;

-- Redundant single-column FKs can now be removed after composite validation.
ALTER TABLE canvas.assets
  DROP CONSTRAINT assets_project_id_fkey;

ALTER TABLE canvas.library_entries
  DROP CONSTRAINT library_entries_project_id_fkey,
  DROP CONSTRAINT library_entries_cover_asset_id_fkey;

COMMIT;
