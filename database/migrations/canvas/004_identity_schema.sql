-- ============================================================
-- canvas schema · 004 — multi-identity accounts
-- Externalize identity off canvas.users into canvas.auth_identities so one
-- person can hold many login methods (email/phone/password/wechat/feishu/...),
-- with WeChat unionid merging multiple openids into one user. Backfills each
-- existing user into email + password (+ feishu) identities, then DROPS the
-- email/password_hash/feishu_union_id columns (Beta, no back-compat burden).
-- See docs/architecture.md and the account/session plan.
-- ============================================================
BEGIN;

-- 1) identities: one row per login method. provider_uid is the normalized stable
--    key (wechat unionid>openid, feishu union_id, E.164 phone, lowercased email).
CREATE TABLE canvas.auth_identities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES canvas.users(id) ON DELETE CASCADE,
  provider      VARCHAR(32) NOT NULL,   -- password|email|phone|wechat_mp|wechat_oa|wechat_open|feishu|wecom|...
  provider_uid  VARCHAR(191) NOT NULL,  -- normalized stable key
  union_key     VARCHAR(191),           -- wechat unionid / feishu union_id (cross-app merge key)
  app_id        VARCHAR(128),           -- source app: miniapp appid / oa appid / corpid
  openid        VARCHAR(191),           -- raw per-app openid (trace)
  verified_at   TIMESTAMPTZ,            -- phone/email proven; NULL = not yet a usable login
  secret_hash   TEXT,                   -- argon2id, only for provider='password'
  raw_profile   JSONB NOT NULL DEFAULT '{}',
  last_authenticated_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_identity_provider_uid UNIQUE (provider, provider_uid)
);
CREATE INDEX ix_identity_union ON canvas.auth_identities (provider, union_key) WHERE union_key IS NOT NULL;
CREATE INDEX ix_identity_user ON canvas.auth_identities (user_id);

-- 2) verification challenges: SMS/email codes, magic-link tokens, merge confirms.
CREATE TABLE canvas.verification_challenges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       VARCHAR(10) NOT NULL,   -- phone | email
  target        VARCHAR(191) NOT NULL,  -- E.164 / normalized email
  purpose       VARCHAR(20) NOT NULL,   -- login | bind | merge_confirm
  code_hash     TEXT,                   -- sha256(code)
  token_hash    TEXT,                   -- sha256(magic-link token)
  user_id       UUID,                   -- bind/merge initiator
  consumed_at   TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_challenge_lookup ON canvas.verification_challenges (channel, target, purpose, consumed_at);

-- 3) account merge audit (P2 writes; created now so the table exists).
CREATE TABLE canvas.account_merge_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surviving_user_id  UUID NOT NULL,
  merged_user_id     UUID,                 -- NULL for single-identity force_bind
  kind               VARCHAR(20) NOT NULL, -- force_bind | full_merge | silent_merge
  moved_identity_ids UUID[] NOT NULL DEFAULT '{}',
  reassigned_fk      JSONB NOT NULL DEFAULT '{}',
  operated_by        UUID NOT NULL,
  reason             VARCHAR(40),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) link a session to the identity it was minted from (P0 left this for 004).
ALTER TABLE canvas.auth_sessions
  ADD COLUMN identity_id UUID REFERENCES canvas.auth_identities(id) ON DELETE SET NULL;

-- 5) users gains profile pointer + merge tombstone.
ALTER TABLE canvas.users
  ADD COLUMN primary_identity_id UUID,
  ADD COLUMN merged_into_user_id UUID REFERENCES canvas.users(id) ON DELETE SET NULL;

-- 6) BACKFILL existing users into identities (email unverified until re-proven;
--    password identity keeps the old hash so nobody's login breaks).
INSERT INTO canvas.auth_identities (user_id, provider, provider_uid, raw_profile, created_at)
  SELECT id, 'email', lower(email), '{}', created_at FROM canvas.users WHERE email IS NOT NULL;
INSERT INTO canvas.auth_identities (user_id, provider, provider_uid, secret_hash, verified_at, raw_profile, created_at)
  SELECT id, 'password', lower(email), password_hash, created_at, '{}', created_at
    FROM canvas.users WHERE password_hash IS NOT NULL AND email IS NOT NULL;
INSERT INTO canvas.auth_identities (user_id, provider, provider_uid, union_key, verified_at, raw_profile, created_at)
  SELECT id, 'feishu', feishu_union_id, feishu_union_id, created_at, '{}', created_at
    FROM canvas.users WHERE feishu_union_id IS NOT NULL;

UPDATE canvas.users u SET primary_identity_id = (
  SELECT i.id FROM canvas.auth_identities i WHERE i.user_id = u.id AND i.provider = 'email' LIMIT 1
);

-- 7) drop the externalized columns (UNIQUE constraints drop with them).
ALTER TABLE canvas.users DROP COLUMN email;
ALTER TABLE canvas.users DROP COLUMN password_hash;
ALTER TABLE canvas.users DROP COLUMN feishu_union_id;

-- 8) now that backfill populated it, enforce the profile-pointer FK.
ALTER TABLE canvas.users
  ADD CONSTRAINT fk_users_primary_identity FOREIGN KEY (primary_identity_id)
  REFERENCES canvas.auth_identities(id) ON DELETE SET NULL;

COMMIT;
