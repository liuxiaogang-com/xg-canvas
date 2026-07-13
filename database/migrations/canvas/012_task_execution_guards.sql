-- ============================================================
-- canvas schema · 012 — Durable task leases and idempotent output rows.
-- Additive: 009–011 may already be present in developer databases.
-- ============================================================
BEGIN;

ALTER TABLE canvas.tasks
  ADD COLUMN IF NOT EXISTS attempt_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

ALTER TABLE canvas.tasks
  ADD CONSTRAINT ck_tasks_attempt_no CHECK (attempt_no >= 0) NOT VALID,
  ADD CONSTRAINT ck_tasks_lease_pair CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT ck_tasks_terminal_no_lease CHECK (
    status NOT IN ('succeeded', 'failed', 'cancelled') OR lease_token IS NULL
  ) NOT VALID;

ALTER TABLE canvas.tasks VALIDATE CONSTRAINT ck_tasks_attempt_no;
ALTER TABLE canvas.tasks VALIDATE CONSTRAINT ck_tasks_lease_pair;
ALTER TABLE canvas.tasks VALIDATE CONSTRAINT ck_tasks_terminal_no_lease;

CREATE INDEX IF NOT EXISTS idx_tasks_invoke_claim
  ON canvas.tasks(status, next_poll_at, lease_expires_at, created_at)
  WHERE external_task_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_poll_claim
  ON canvas.tasks(next_poll_at, lease_expires_at)
  WHERE status = 'running' AND external_task_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_assets_task_storage
  ON canvas.assets(task_id, storage_key)
  WHERE task_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;
