CREATE TABLE account.instance_setup (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  owner_user_id uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE account.instance_setup IS
  'Singleton, monotonic state for the one-time instance owner setup flow.';
