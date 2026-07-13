-- 002_request_log_cost.sql
-- Freeze per-request billing onto each log row. Cost is computed at write time from
-- the model's then-current native-meter rate (account.model_definitions.pricing), so
-- changing a model's price never rewrites historical cost ("new requests new price,
-- old locked"). Currency is the model's own currency — meters stay native (tokens /
-- seconds / images), nothing is converted to a synthetic unit.

ALTER TABLE ops.request_logs ADD COLUMN IF NOT EXISTS cost numeric(14, 6);
ALTER TABLE ops.request_logs ADD COLUMN IF NOT EXISTS cost_currency varchar(10);

-- Aggregation index for billing analytics (group by model / owner / project).
CREATE INDEX IF NOT EXISTS request_logs_billing_idx
  ON ops.request_logs (model_id, owner_id, project_id)
  WHERE cost IS NOT NULL;
