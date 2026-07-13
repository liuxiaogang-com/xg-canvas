ALTER TABLE account.model_definitions
  ADD COLUMN IF NOT EXISTS input_contract JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN account.model_definitions.input_contract IS
  'Canonical generation input contract: supported modes and required/optional reference slots.';
