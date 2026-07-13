-- ============================================================
-- canvas schema · 013 — Upgrade backfill for durable execution.
-- 012 is already ledgered; all follow-up changes stay additive.
-- ============================================================
BEGIN;

-- Pre-lease versions could leave synchronous work as running without an
-- external id. Make those rows recoverable by the new claim path.
UPDATE canvas.tasks
   SET status = 'queued',
       started_at = NULL,
       next_poll_at = NOW(),
       updated_at = NOW()
 WHERE status = 'running'
   AND external_task_id IS NULL
   AND lease_token IS NULL;

ALTER TABLE canvas.tasks
  ADD CONSTRAINT ck_tasks_status CHECK (
    status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled')
  ) NOT VALID,
  ADD CONSTRAINT ck_tasks_retry_count CHECK (retry_count >= 0) NOT VALID;

ALTER TABLE canvas.tasks VALIDATE CONSTRAINT ck_tasks_status;
ALTER TABLE canvas.tasks VALIDATE CONSTRAINT ck_tasks_retry_count;

COMMIT;
