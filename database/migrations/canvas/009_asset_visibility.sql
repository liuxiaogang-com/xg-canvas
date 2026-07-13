-- Asset visibility: who can see an asset, independent from storage scope.
--   private   -> owner only
--   project   -> members with project.asset.view on project_id
--   workspace -> any workspace member
ALTER TABLE canvas.assets
  ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'project';

UPDATE canvas.assets
SET visibility = CASE WHEN scope = 'workspace' THEN 'workspace' ELSE 'project' END;

CREATE INDEX idx_assets_owner_created ON canvas.assets(owner_id, created_at DESC);
