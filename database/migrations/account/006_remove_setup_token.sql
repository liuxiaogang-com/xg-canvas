-- Compatibility for local Beta databases that already applied the pre-release
-- version of 005_instance_setup.sql. Fresh databases never create this column.
ALTER TABLE account.instance_setup DROP COLUMN IF EXISTS token_hash;
