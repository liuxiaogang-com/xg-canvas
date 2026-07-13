-- ============================================================
-- canvas schema · 003 — server-side sessions + devices
-- Replaces stateless JWT with opaque server-side sessions so we can
-- revoke instantly (踢设备), cap device count, and read role live.
-- Truth lives here in Postgres; Redis (xgcanvas:session:*) is a liveness
-- cache that can be rebuilt. One auth_sessions row = one login state;
-- one auth_devices row = one device (the device-limit unit).
-- P0 has no identity_id yet — 004 adds it once auth_identities exists.
-- See docs/architecture.md and the account/session plan.
-- ============================================================
BEGIN;

-- A device = the unit the device-count limit and "踢设备" act on.
CREATE TABLE canvas.auth_devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES canvas.users(id) ON DELETE CASCADE,
  client_device_id VARCHAR(128),               -- web cookie uuid / 小程序 install id; same-device reuse key
  device_label     VARCHAR(120),               -- "Chrome · macOS" / "微信小程序"
  platform         VARCHAR(40),
  user_agent       TEXT,
  last_ip          INET,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at       TIMESTAMPTZ
);
-- same (user, client_device_id) re-login reuses the device row instead of a new slot
CREATE UNIQUE INDEX uq_device_user_client ON canvas.auth_devices (user_id, client_device_id)
  WHERE client_device_id IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX ix_device_user_active ON canvas.auth_devices (user_id) WHERE revoked_at IS NULL;

-- A session = one login state. id IS the opaque token's sid; token_hash = sha256(token).
CREATE TABLE canvas.auth_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES canvas.users(id) ON DELETE CASCADE,
  device_id       UUID NOT NULL REFERENCES canvas.auth_devices(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE,
  token_hash      BYTEA NOT NULL,              -- sha256(opaque token); never store plaintext
  prev_token_hash BYTEA,                       -- last generation, for refresh-rotation replay detection
  status          VARCHAR(16) NOT NULL DEFAULT 'active',  -- active | revoked | expired
  email           VARCHAR(255),                -- snapshot at issue (so role/identity stays self-contained)
  role            VARCHAR(20) NOT NULL DEFAULT 'member',   -- role frozen per session; changes take effect on next login
  revoked_at      TIMESTAMPTZ,
  revoked_reason  VARCHAR(40),                 -- logout | kicked | device_limit_lru | password_changed | merged | security
  created_via     VARCHAR(20),                 -- password | wechat | feishu | phone | email
  remember        BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,        -- absolute expiry; sliding renewal must not pass this
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_session_token_hash ON canvas.auth_sessions (token_hash);
CREATE INDEX ix_session_user_active ON canvas.auth_sessions (user_id) WHERE status = 'active';

COMMIT;
