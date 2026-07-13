-- ============================================================
-- canvas · 006 — dedupe canvas edges
-- Stop stacking identical connections between the same endpoints. The app layer
-- (EdgeService.create) also checks, but the constraint is the real guarantee and
-- backs the replace()/reconcile path too. De-dupe any existing duplicates first.
-- ============================================================
BEGIN;

-- Drop pre-existing duplicates, keeping the earliest row per endpoint tuple.
DELETE FROM canvas.canvas_edges e
USING canvas.canvas_edges d
WHERE e.canvas_id = d.canvas_id
  AND e.source_node_id = d.source_node_id
  AND e.source_handle = d.source_handle
  AND e.target_node_id = d.target_node_id
  AND e.target_handle = d.target_handle
  AND e.created_at > d.created_at;

ALTER TABLE canvas.canvas_edges
  ADD CONSTRAINT uk_edge_endpoints
  UNIQUE (canvas_id, source_node_id, source_handle, target_node_id, target_handle);

COMMIT;
