CREATE TABLE IF NOT EXISTS account.system_settings (
  key varchar(100) PRIMARY KEY,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_payload bytea,
  encryption_key_id varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE account.system_settings IS
  'Encrypted runtime integration settings managed from the admin UI.';
