-- XG Canvas non-Catalog demo seed.
--
-- This seed intentionally creates only users, a workspace, projects, canvases,
-- nodes, and edges. Official/local Catalog resources are imported by the
-- application, and executable tasks must always carry an exact Catalog pin.
--
-- Run:
--   docker exec -i xgcanvas-postgres psql -U xgcanvas -d xgcanvas \
--     < scripts/seed-demo-data.sql

BEGIN;

-- demo@xgcanvas.test / demo12345678
INSERT INTO canvas.users (id, display_name, status)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Demo 用户', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO canvas.auth_identities (user_id, provider, provider_uid, verified_at)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'email',
  'demo@xgcanvas.test',
  NOW()
)
ON CONFLICT (provider, provider_uid) DO NOTHING;

INSERT INTO canvas.auth_identities (
  user_id,
  provider,
  provider_uid,
  secret_hash,
  verified_at
)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'password',
  'demo@xgcanvas.test',
  '$argon2id$v=19$m=65536,t=3,p=4$KZovAuoozrclRD1uxQHt6Q$GUOrInwxh56be64OceW7ZFc/dQKxMLyvD85zgEKBGqA',
  NOW()
)
ON CONFLICT (provider, provider_uid) DO NOTHING;

UPDATE canvas.users AS users
   SET primary_identity_id = identities.id
  FROM canvas.auth_identities AS identities
 WHERE users.id = 'a0000000-0000-4000-8000-000000000001'
   AND identities.user_id = users.id
   AND identities.provider = 'email'
   AND users.primary_identity_id IS NULL;

INSERT INTO canvas.workspaces (id, name, owner_id)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'Demo 工作空间',
  'a0000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO canvas.workspace_members (workspace_id, user_id, role)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'owner'
)
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO canvas.projects (
  id,
  workspace_id,
  name,
  description,
  is_favorite,
  created_by
)
VALUES
  (
    'c0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    '品牌广告视频',
    '广告文案、产品图和视频分镜的示例画布',
    TRUE,
    'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    '短剧分镜',
    '角色、场景和分镜组织示例',
    FALSE,
    'a0000000-0000-4000-8000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO canvas.canvases (id, project_id, name, last_modified_by)
VALUES
  (
    'd0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'main',
    'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000002',
    'main',
    'a0000000-0000-4000-8000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

-- Model selection is deliberately absent. A user chooses a currently
-- available Catalog model before execution, at which point the task is pinned.
INSERT INTO canvas.canvas_nodes (id, canvas_id, type, position, data)
VALUES
  (
    'e0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'gen_text',
    '{"x":100,"y":150}',
    '{"prompt":"为高端护肤品写一段 30 秒视频广告文案，强调天然成分和奢华质感","temperature":0.7,"max_tokens":1024}'
  ),
  (
    'e0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000001',
    'gen_image',
    '{"x":500,"y":80}',
    '{"prompt":"极简风格护肤品广告图，柔光摄影，白色背景，精致瓶身特写","aspect_ratio":"16:9"}'
  ),
  (
    'e0000000-0000-4000-8000-000000000010',
    'd0000000-0000-4000-8000-000000000002',
    'script_input',
    '{"x":100,"y":100}',
    '{"script_text":"第一集：小镇青年意外获得一台能预知未来的手机。"}'
  ),
  (
    'e0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000002',
    'storyboard_shot',
    '{"x":500,"y":100}',
    '{"shot_no":1,"summary":"小镇清晨，主角走出便利店","prompt":"小镇清晨全景，年轻人走出便利店","duration_sec":3,"target":"image","dialogue":""}'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO canvas.canvas_edges (
  id,
  canvas_id,
  source_node_id,
  source_handle,
  target_node_id,
  target_handle,
  data_type
)
VALUES (
  'f0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'output_text',
  'e0000000-0000-4000-8000-000000000002',
  'prompt',
  'text'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT 'Users: ' || COUNT(*) FROM canvas.users;
SELECT 'Projects: ' || COUNT(*) FROM canvas.projects;
SELECT 'Canvases: ' || COUNT(*) FROM canvas.canvases;
SELECT 'Nodes: ' || COUNT(*) FROM canvas.canvas_nodes;
SELECT 'Edges: ' || COUNT(*) FROM canvas.canvas_edges;
