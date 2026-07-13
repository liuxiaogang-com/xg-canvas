-- ============================================================
-- account schema · 002 — Feature Model Config
-- Maps feature scenarios (AI analysis, agent, upscale, etc.)
-- to specific model pools with primary/fallback resolution.
-- ============================================================
BEGIN;

SET search_path TO account, public;

-- ------------------------------------------------------------
-- feature_model_configs
-- ------------------------------------------------------------
CREATE TABLE account.feature_model_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  model_ids TEXT[] NOT NULL DEFAULT '{}',
  primary_model_id VARCHAR(200),
  fallback_model_id VARCHAR(200),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feature_config_key ON account.feature_model_configs(feature_key);

COMMENT ON TABLE  account.feature_model_configs IS 'Per-feature model assignments: pool + primary + fallback. Used by request-log AI analysis, agent, upscale, etc.';
COMMENT ON COLUMN account.feature_model_configs.model_ids IS 'Model IDs (provider:model_key) in the eligible pool for this feature.';
COMMENT ON COLUMN account.feature_model_configs.primary_model_id IS 'Preferred model — tried first. Must be in model_ids.';
COMMENT ON COLUMN account.feature_model_configs.fallback_model_id IS 'Backup model — tried if primary is unavailable. Must be in model_ids.';

-- Seed: AI analysis feature
INSERT INTO account.feature_model_configs (feature_key, display_name, description, model_ids, primary_model_id, enabled)
VALUES (
  'ai-analysis',
  'AI 分析',
  '用于请求日志的 AI 智能分析和诊断',
  ARRAY['deepseek:deepseek-v4-flash'],
  'deepseek:deepseek-v4-flash',
  true
) ON CONFLICT (feature_key) DO NOTHING;

-- Seed: Agent feature (canvas node editing assistant)
INSERT INTO account.feature_model_configs (feature_key, display_name, description, model_ids, primary_model_id, enabled)
VALUES (
  'agent',
  '画布 Agent',
  '画布节点编辑助手，理解自然语言指令并修改节点参数',
  ARRAY['openai:gpt-4o-mini'],
  'openai:gpt-4o-mini',
  true
) ON CONFLICT (feature_key) DO NOTHING;

COMMIT;
