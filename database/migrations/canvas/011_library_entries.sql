-- Unified reusable-resource library (characters, voices, styles, ...).
-- An entry carries two coexisting binding forms:
--   material      -> assets in our bucket ({"asset_ids": [...]})
--   provider_refs -> vendor-side resources ([{provider_resource_uid,
--                                             channel_resource_uid, credential_id,
--                                             external_ref_id, verified_params,
--                                             sample_asset_id, status}])
CREATE TABLE canvas.library_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(30) NOT NULL,                        -- voice|character|style|...
  scope VARCHAR(20) NOT NULL DEFAULT 'workspace',   -- workspace|project
  visibility VARCHAR(20) NOT NULL DEFAULT 'workspace', -- private|project|workspace
  workspace_id UUID NOT NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES canvas.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES canvas.users(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  cover_asset_id UUID REFERENCES canvas.assets(id) ON DELETE SET NULL,
  material JSONB,
  provider_refs JSONB NOT NULL DEFAULT '[]',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_library_entries_ws_kind ON canvas.library_entries(workspace_id, kind, created_at DESC);
CREATE INDEX idx_library_entries_tags ON canvas.library_entries USING GIN (tags);

-- Narrative entities reference a reusable library entry (not merged: entities
-- stay project-scoped narrative objects; library entries are cross-project).
ALTER TABLE canvas.entities
  ADD COLUMN library_entry_id UUID REFERENCES canvas.library_entries(id) ON DELETE SET NULL;
