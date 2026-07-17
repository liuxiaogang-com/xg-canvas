-- account schema · 002 — Feature model bindings by stable Catalog UUID.
BEGIN;

SET search_path TO account, public;

CREATE TABLE account.feature_model_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account.feature_model_bindings (
  feature_config_id UUID NOT NULL
    REFERENCES account.feature_model_configs(id) ON DELETE CASCADE,
  model_resource_uid UUID NOT NULL
    REFERENCES account.catalog_resources(resource_uid) ON DELETE RESTRICT,
  priority INTEGER NOT NULL CHECK (priority >= 0),
  PRIMARY KEY(feature_config_id, model_resource_uid),
  UNIQUE(feature_config_id, priority)
);

CREATE INDEX idx_feature_config_key
  ON account.feature_model_configs(feature_key);
CREATE INDEX idx_feature_bindings_model
  ON account.feature_model_bindings(model_resource_uid);

INSERT INTO account.feature_model_configs(feature_key, display_name, description)
VALUES
  ('ai-analysis', 'AI 分析', '用于请求日志的 AI 智能分析和诊断'),
  ('agent', '画布 Agent', '画布节点编辑助手，理解自然语言指令并修改节点参数'),
  ('script-extract', '脚本结构化提取', '用于剧本与内容的 JSON 结构化提取')
ON CONFLICT (feature_key) DO NOTHING;

COMMIT;
