-- Preflight for 012's task-output unique index. This file sorts before 012 on
-- fresh installs while remaining safe for databases where 012 is already in
-- the permanent migration ledger.
DO $$
DECLARE
  duplicate_groups BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO duplicate_groups
    FROM (
      SELECT task_id, storage_key
        FROM canvas.assets
       WHERE task_id IS NOT NULL AND deleted_at IS NULL
       GROUP BY task_id, storage_key
      HAVING COUNT(*) > 1
    ) duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'Cannot add uk_assets_task_storage: % duplicate task/storage groups require reference-aware cleanup',
      duplicate_groups
      USING HINT = 'Inspect tasks.output_asset_ids, favorites, library entries and entities before merging duplicate asset rows.';
  END IF;
END $$;
