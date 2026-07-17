-- ============================================================
-- canvas schema · 002 — chat conversations + messages
-- The 对话 (chat) lane: conversation persistence so a chat survives refresh
-- and can be resumed. Generation jobs stay in canvas.tasks; chat turns live
-- here (a turn that triggers a generation links via task_id later).
-- See docs/agent-spec.md.
-- ============================================================
BEGIN;

CREATE TABLE canvas.conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES canvas.workspaces(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES canvas.projects(id) ON DELETE SET NULL,
  owner_id      UUID NOT NULL REFERENCES canvas.users(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL DEFAULT '新对话',
  model_id      VARCHAR(200),
  system_prompt TEXT,
  params        JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conversations_owner ON canvas.conversations(owner_id, updated_at DESC);

CREATE TABLE canvas.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES canvas.conversations(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,   -- system | user | assistant | tool
  content         TEXT NOT NULL DEFAULT '',
  reasoning       TEXT,                   -- reasoner chain-of-thought (reasoning_content)
  tool_calls      JSONB,
  usage           JSONB,                  -- token meters for this turn
  latency_ms      INTEGER,
  request_id      VARCHAR(120),           -- correlate to ops.request_logs
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON canvas.messages(conversation_id, created_at);

COMMIT;
