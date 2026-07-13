-- ============================================================
-- canvas schema · 016 — Retryable cleanup for completed upload staging.
-- ============================================================
BEGIN;

ALTER TABLE canvas.asset_upload_drafts
  ADD COLUMN staging_cleaned_at TIMESTAMPTZ;

CREATE INDEX idx_asset_upload_drafts_staging_cleanup
  ON canvas.asset_upload_drafts(updated_at)
  WHERE status = 'completed' AND staging_cleaned_at IS NULL;

COMMIT;
