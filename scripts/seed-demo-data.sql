-- XG Canvas demo data seed (idempotent — uses ON CONFLICT DO NOTHING)
-- Run: docker exec -i xgcanvas-postgres psql -U xgcanvas -d xgcanvas < scripts/seed-demo-data.sql

BEGIN;

-- ============ DEMO USER + WORKSPACE ============
-- Identity (email/password) lives in canvas.auth_identities since migration 004.
INSERT INTO canvas.users (id, display_name, status)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Demo 用户', 'active')
ON CONFLICT (id) DO NOTHING;

-- demo@xgcanvas.test / demo12345678 (real argon2id hash; dev-login also works)
INSERT INTO canvas.auth_identities (user_id, provider, provider_uid, verified_at)
VALUES ('a0000000-0000-4000-8000-000000000001', 'email', 'demo@xgcanvas.test', NOW())
ON CONFLICT (provider, provider_uid) DO NOTHING;
INSERT INTO canvas.auth_identities (user_id, provider, provider_uid, secret_hash, verified_at)
VALUES ('a0000000-0000-4000-8000-000000000001', 'password', 'demo@xgcanvas.test',
        '$argon2id$v=19$m=65536,t=3,p=4$KZovAuoozrclRD1uxQHt6Q$GUOrInwxh56be64OceW7ZFc/dQKxMLyvD85zgEKBGqA', NOW())
ON CONFLICT (provider, provider_uid) DO NOTHING;

INSERT INTO canvas.workspaces (id, name, owner_id)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'Demo 工作空间',
  'a0000000-0000-4000-8000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO canvas.workspace_members (workspace_id, user_id, role)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'owner'
) ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Second team member — alice@xgcanvas.test / demo12345678
INSERT INTO canvas.users (id, display_name, status)
VALUES ('a0000000-0000-4000-8000-000000000002', 'Alice 设计师', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO canvas.auth_identities (user_id, provider, provider_uid, verified_at)
VALUES ('a0000000-0000-4000-8000-000000000002', 'email', 'alice@xgcanvas.test', NOW())
ON CONFLICT (provider, provider_uid) DO NOTHING;
INSERT INTO canvas.auth_identities (user_id, provider, provider_uid, secret_hash, verified_at)
VALUES ('a0000000-0000-4000-8000-000000000002', 'password', 'alice@xgcanvas.test',
        '$argon2id$v=19$m=65536,t=3,p=4$KZovAuoozrclRD1uxQHt6Q$GUOrInwxh56be64OceW7ZFc/dQKxMLyvD85zgEKBGqA', NOW())
ON CONFLICT (provider, provider_uid) DO NOTHING;

-- point each seeded user at their email identity
UPDATE canvas.users u SET primary_identity_id = (
  SELECT i.id FROM canvas.auth_identities i WHERE i.user_id = u.id AND i.provider = 'email' LIMIT 1
)
WHERE u.id IN ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002')
  AND u.primary_identity_id IS NULL;

INSERT INTO canvas.workspace_members (workspace_id, user_id, role)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'member'
) ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- ============ 4 PROJECTS ============
INSERT INTO canvas.projects (id, workspace_id, name, description, is_favorite, created_by) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   '品牌广告视频', '为某护肤品牌制作 30 秒短视频广告，含文案→图片→视频全链路', true,
   'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   '产品展示图', '批量生成电商产品主图，多角度多风格', false,
   'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
   '短剧分镜', '6 集竖屏短剧分镜脚本拆解', false,
   'a0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001',
   'AI 配音工坊', '语音合成 + 转录测试', false,
   'a0000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ============ CANVASES (1 per project) ============
INSERT INTO canvas.canvases (id, project_id, name, last_modified_by) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'main', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',
   'main', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
   'main', 'a0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004',
   'main', 'a0000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ============ CANVAS 1: 品牌广告视频 — NODES ============
INSERT INTO canvas.canvas_nodes (id, canvas_id, type, position, data) VALUES
  -- gen_text: 广告文案
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'gen_text', '{"x": 100, "y": 150}',
   '{"prompt": "为高端护肤品写一段 30 秒视频广告文案，强调天然成分和奢华质感", "model_id": "jimeng/text-v1", "temperature": 0.7, "max_tokens": 1024}'),
  -- gen_image: 产品主图
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'gen_image', '{"x": 500, "y": 80}',
   '{"prompt": "极简风格护肤品广告图，柔光摄影，白色背景，精致瓶身特写", "model_id": "jimeng/image-v1", "aspect_ratio": "16:9", "resolution": "1k"}'),
  -- gen_video: 广告视频
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001',
   'gen_video', '{"x": 500, "y": 350}',
   '{"prompt": "根据产品图生成 5 秒广告视频片段，缓慢推镜，柔光效果", "model_id": "jimeng/video-v1", "duration_sec": 5, "aspect_ratio": "16:9"}'),
  -- gen_audio: 旁白配音
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001',
   'gen_audio', '{"x": 100, "y": 400}',
   '{"prompt": "每一天都值得被温柔呵护，源自自然的力量，为你的肌肤带来极致焕新体验", "model_id": "jimeng/tts-v1", "duration_sec": 15, "variant": "tts"}')
ON CONFLICT (id) DO NOTHING;

-- ============ CANVAS 1: EDGES ============
INSERT INTO canvas.canvas_edges (id, canvas_id, source_node_id, source_handle, target_node_id, target_handle, data_type) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 'output_text',
   'e0000000-0000-4000-8000-000000000002', 'prompt', 'text'),
  ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000002', 'output_image',
   'e0000000-0000-4000-8000-000000000003', 'reference_image', 'image')
ON CONFLICT (id) DO NOTHING;

-- ============ CANVAS 2: 产品展示图 — NODES ============
INSERT INTO canvas.canvas_nodes (id, canvas_id, type, position, data) VALUES
  ('e0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000002',
   'gen_text', '{"x": 100, "y": 100}',
   '{"prompt": "电商产品描述：极简设计蓝牙耳机，主打降噪与舒适佩戴", "model_id": "jimeng/text-v1", "temperature": 0.8, "max_tokens": 512}'),
  ('e0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000002',
   'gen_image', '{"x": 500, "y": 50}',
   '{"prompt": "电商主图：白色背景，极简蓝牙耳机产品图，45度角", "model_id": "jimeng/image-v1", "aspect_ratio": "1:1", "resolution": "1k"}'),
  ('e0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000002',
   'gen_image', '{"x": 500, "y": 300}',
   '{"prompt": "电商场景图：蓝牙耳机佩戴效果，都市通勤场景", "model_id": "jimeng/image-v1", "aspect_ratio": "1:1", "resolution": "1k"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO canvas.canvas_edges (id, canvas_id, source_node_id, source_handle, target_node_id, target_handle, data_type) VALUES
  ('f0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000010', 'output_text',
   'e0000000-0000-4000-8000-000000000011', 'prompt', 'text')
ON CONFLICT (id) DO NOTHING;

-- ============ CANVAS 3: 短剧分镜 — NODES ============
INSERT INTO canvas.canvas_nodes (id, canvas_id, type, position, data) VALUES
  ('e0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000003',
   'script_input', '{"x": 100, "y": 100}',
   '{"script_text": "第一集：小镇青年张明意外获得一台能预知未来的手机。他最初用来避开生活中的小麻烦，逐渐发现手机的预言越来越准确，也越来越危险……"}'),
  ('e0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000003',
   'entity_character', '{"x": 500, "y": 50}',
   '{"name": "张明", "description": "25 岁，小镇便利店店员，性格善良但犹豫不决", "reference_image_url": null}'),
  ('e0000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000003',
   'entity_character', '{"x": 500, "y": 250}',
   '{"name": "李薇", "description": "24 岁，镇上咖啡馆老板娘，张明的青梅竹马", "reference_image_url": null}'),
  ('e0000000-0000-4000-8000-000000000023', 'd0000000-0000-4000-8000-000000000003',
   'entity_scene', '{"x": 500, "y": 450}',
   '{"name": "便利店内景", "description": "老旧的小镇便利店，货架拥挤，暖黄灯光，有复古收银机"}'),
  ('e0000000-0000-4000-8000-000000000024', 'd0000000-0000-4000-8000-000000000003',
   'storyboard_shot', '{"x": 900, "y": 100}',
   '{"shot_no": 1, "summary": "远景：小镇清晨，街道安静，张明推门走出便利店", "prompt": "小镇清晨全景，一个年轻人推门走出便利店", "duration_sec": 3, "target": "image", "model_id": null, "dialogue": ""}'),
  ('e0000000-0000-4000-8000-000000000025', 'd0000000-0000-4000-8000-000000000003',
   'storyboard_shot', '{"x": 900, "y": 350}',
   '{"shot_no": 2, "summary": "特写：手机屏幕亮起一条神秘推送通知", "prompt": "手机特写，屏幕亮起推送通知", "duration_sec": 2, "target": "image", "model_id": null, "dialogue": ""}')
ON CONFLICT (id) DO NOTHING;

-- ============ CANVAS 4: 配音工坊 — NODES ============
INSERT INTO canvas.canvas_nodes (id, canvas_id, type, position, data) VALUES
  ('e0000000-0000-4000-8000-000000000030', 'd0000000-0000-4000-8000-000000000004',
   'gen_audio', '{"x": 100, "y": 100}',
   '{"prompt": "欢迎收听每日科技播报，今天我们来聊聊人工智能在创意产业中的最新应用", "model_id": "jimeng/tts-v1", "duration_sec": 20, "variant": "tts"}'),
  ('e0000000-0000-4000-8000-000000000031', 'd0000000-0000-4000-8000-000000000004',
   'audio_transcribe', '{"x": 500, "y": 100}',
   '{"model_id": "jimeng/asr-v1"}'),
  ('e0000000-0000-4000-8000-000000000032', 'd0000000-0000-4000-8000-000000000004',
   'gen_text', '{"x": 100, "y": 350}',
   '{"prompt": "将以下播报文稿改写为更口语化的风格", "model_id": "jimeng/text-v1", "temperature": 0.9, "max_tokens": 512}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO canvas.canvas_edges (id, canvas_id, source_node_id, source_handle, target_node_id, target_handle, data_type) VALUES
  ('f0000000-0000-4000-8000-000000000030', 'd0000000-0000-4000-8000-000000000004',
   'e0000000-0000-4000-8000-000000000030', 'output_audio',
   'e0000000-0000-4000-8000-000000000031', 'input_audio', 'audio')
ON CONFLICT (id) DO NOTHING;

-- ============ COMPLETED TASKS (for stats) ============
INSERT INTO canvas.tasks (id, type, status, model_id, source_node_id, project_id, workspace_id, owner_id, params, inputs, output_asset_ids, text_output, progress, started_at, finished_at) VALUES
  -- Project 1: 3 succeeded, 1 failed
  ('10000000-0000-4000-8000-000000000001', 'gen.text', 'succeeded', 'jimeng/text-v1',
   'e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{}', '{}', '{}',
   '在 AI 创意工作流中，灵感与技术的交汇往往能碰撞出最精彩的创意。', 1,
   NOW() - interval '2 hours', NOW() - interval '1 hour 58 minutes'),

  ('10000000-0000-4000-8000-000000000002', 'gen.image', 'succeeded', 'jimeng/image-v1',
   'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{}', '{}', '{}', NULL, 1,
   NOW() - interval '1 hour 55 minutes', NOW() - interval '1 hour 50 minutes'),

  ('10000000-0000-4000-8000-000000000003', 'gen.video', 'succeeded', 'jimeng/video-v1',
   'e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{}', '{}', '{}', NULL, 1,
   NOW() - interval '1 hour 45 minutes', NOW() - interval '1 hour 40 minutes'),

  ('10000000-0000-4000-8000-000000000004', 'gen.video', 'failed', 'jimeng/video-v1',
   'e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{}', '{}', '{}', NULL, 0,
   NOW() - interval '1 hour 30 minutes', NOW() - interval '1 hour 28 minutes'),

  -- Project 2: 2 succeeded
  ('10000000-0000-4000-8000-000000000005', 'gen.text', 'succeeded', 'jimeng/text-v1',
   'e0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{}', '{}', '{}',
   '极简设计蓝牙耳机，采用人体工学结构，40dB 主动降噪。', 1,
   NOW() - interval '3 hours', NOW() - interval '2 hours 58 minutes'),

  ('10000000-0000-4000-8000-000000000006', 'gen.image', 'succeeded', 'jimeng/image-v1',
   'e0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{}', '{}', '{}', NULL, 1,
   NOW() - interval '2 hours 55 minutes', NOW() - interval '2 hours 50 minutes'),

  -- Project 3: 1 succeeded (by Alice)
  ('10000000-0000-4000-8000-000000000007', 'gen.text', 'succeeded', 'jimeng/text-v1',
   'e0000000-0000-4000-8000-000000000020', 'c0000000-0000-4000-8000-000000000003',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   '{}', '{}', '{}',
   '【优化后剧本】第一幕：清晨，小镇街道。旁白引入——"每个人心中都有一个不敢打开的预言"', 1,
   NOW() - interval '5 hours', NOW() - interval '4 hours 58 minutes'),

  -- Project 4: 2 succeeded
  ('10000000-0000-4000-8000-000000000008', 'gen.audio', 'succeeded', 'jimeng/tts-v1',
   'e0000000-0000-4000-8000-000000000030', 'c0000000-0000-4000-8000-000000000004',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{}', '{}', '{}', NULL, 1,
   NOW() - interval '4 hours', NOW() - interval '3 hours 55 minutes'),

  ('10000000-0000-4000-8000-000000000009', 'audio.transcribe', 'succeeded', 'jimeng/asr-v1',
   'e0000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000004',
   'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{}', '{}', '{}',
   '欢迎收听每日科技播报，今天我们来聊聊人工智能在创意产业中的最新应用。', 1,
   NOW() - interval '3 hours 50 minutes', NOW() - interval '3 hours 48 minutes')
ON CONFLICT (id) DO NOTHING;

-- Update failed task error field
UPDATE canvas.tasks SET error = '{"code": "PROVIDER_ERROR", "message": "视频生成超时，请稍后重试"}'
WHERE id = '10000000-0000-4000-8000-000000000004' AND error IS NULL;

-- ============ ASSETS (pointing to object-storage demo placeholders) ============
INSERT INTO canvas.assets (id, type, workspace_id, project_id, owner_id, task_id, storage_key, bucket, mime_type, bytes, name) VALUES
  ('20000000-0000-4000-8000-000000000001', 'image', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002',
   'demo/placeholder.svg', 'xgcanvas-assets', 'image/svg+xml', 733, '护肤品广告主图.svg'),
  ('20000000-0000-4000-8000-000000000002', 'video', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000003',
   'demo/placeholder.mp4', 'xgcanvas-assets', 'video/mp4', 144, '广告视频片段.mp4'),
  ('20000000-0000-4000-8000-000000000003', 'image', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000006',
   'demo/placeholder.svg', 'xgcanvas-assets', 'image/svg+xml', 733, '蓝牙耳机主图.svg'),
  ('20000000-0000-4000-8000-000000000004', 'audio', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000008',
   'demo/placeholder.mp3', 'xgcanvas-assets', 'audio/mpeg', 30024, '科技播报配音.mp3')
ON CONFLICT (id) DO NOTHING;

-- Link asset IDs back to tasks
UPDATE canvas.tasks SET output_asset_ids = ARRAY['20000000-0000-4000-8000-000000000001']::uuid[]
WHERE id = '10000000-0000-4000-8000-000000000002';
UPDATE canvas.tasks SET output_asset_ids = ARRAY['20000000-0000-4000-8000-000000000002']::uuid[]
WHERE id = '10000000-0000-4000-8000-000000000003';
UPDATE canvas.tasks SET output_asset_ids = ARRAY['20000000-0000-4000-8000-000000000003']::uuid[]
WHERE id = '10000000-0000-4000-8000-000000000006';
UPDATE canvas.tasks SET output_asset_ids = ARRAY['20000000-0000-4000-8000-000000000004']::uuid[]
WHERE id = '10000000-0000-4000-8000-000000000008';

-- ============ ACCOUNT SCHEMA: PROVIDERS + MODELS (for admin dashboard) ============
-- Add jimeng / minimax / kling providers (doubao already exists from YAML sync)
INSERT INTO account.providers (id, slug, display_name, auth_method, invocation_methods, enabled, description) VALUES
  ('50000000-0000-4000-8000-000000000001', 'jimeng', '即梦 AI', 'cli_login',
   ARRAY['cli']::varchar(20)[], true, '字节跳动旗下 AI 创意平台，支持文生图/文生视频/语音合成'),
  ('50000000-0000-4000-8000-000000000003', 'minimax', 'MiniMax', 'api_key',
   ARRAY['http']::varchar(20)[], true, '国产多模态 AI，支持语音合成和对话'),
  ('50000000-0000-4000-8000-000000000004', 'kling', '可灵 AI', 'api_key',
   ARRAY['http']::varchar(20)[], false, '快手旗下 AI 视频生成平台')
ON CONFLICT (slug) DO NOTHING;

-- Add pricing to existing models via UPDATE
UPDATE account.model_definitions SET pricing = '{"unit": "token", "input_price": 0.0008, "output_price": 0.002, "currency": "CNY"}'
WHERE model_id = 'doubao:doubao-pro-32k' AND pricing IS NULL;
UPDATE account.model_definitions SET pricing = '{"unit": "token", "input_price": 0.0003, "output_price": 0.0006, "currency": "CNY"}'
WHERE model_id = 'doubao:doubao-lite-32k' AND pricing IS NULL;
UPDATE account.model_definitions SET pricing = '{"unit": "second", "price": 0.5, "currency": "CNY"}'
WHERE model_id = 'doubao:seedance-1.0' AND pricing IS NULL;
UPDATE account.model_definitions SET pricing = '{"unit": "second", "price": 0.8, "currency": "CNY"}'
WHERE model_id = 'doubao:seedance-2.0' AND pricing IS NULL;
UPDATE account.model_definitions SET pricing = '{"unit": "token", "input_price": 0.005, "output_price": 0.015, "currency": "CNY"}'
WHERE model_id LIKE 'openai:%' AND pricing IS NULL;
UPDATE account.model_definitions SET pricing = '{"unit": "image", "price": 0.08, "currency": "CNY"}'
WHERE model_id = 'openai:dall-e-3' AND pricing IS NULL;
UPDATE account.model_definitions SET pricing = '{"unit": "token", "input_price": 0.001, "output_price": 0.002, "currency": "CNY"}'
WHERE model_id LIKE 'deepseek:%' AND pricing IS NULL;

-- jimeng models (new provider)
INSERT INTO account.model_definitions (id, provider_id, model_id, provider_model_id, display_name, task_types, param_schema, pricing, enabled) VALUES
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
   'jimeng/text-v1', 'jimeng_text_v1', '即梦文案助手',
   ARRAY['gen.text'], '{"type":"object","properties":{"temperature":{"type":"number","minimum":0,"maximum":2},"max_tokens":{"type":"integer","minimum":1,"maximum":4096}}}',
   '{"unit": "token", "input_price": 0.002, "output_price": 0.006, "currency": "CNY"}', true),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001',
   'jimeng/image-v1', 'jimeng_xl_v1.4', '即梦绘图 XL',
   ARRAY['gen.image'], '{"type":"object","properties":{"aspect_ratio":{"type":"string","enum":["1:1","16:9","9:16","4:3","3:4"]},"resolution":{"type":"string","enum":["512","1k","2k"]}}}',
   '{"unit": "image", "price": 0.15, "currency": "CNY"}', true),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001',
   'jimeng/video-v1', 'jimeng_video_v2', '即梦视频生成',
   ARRAY['gen.video'], '{"type":"object","properties":{"duration_sec":{"type":"integer","minimum":1,"maximum":30},"aspect_ratio":{"type":"string","enum":["16:9","9:16","1:1"]}}}',
   '{"unit": "second", "price": 0.5, "currency": "CNY"}', true),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001',
   'jimeng/tts-v1', 'jimeng_tts_v1', '即梦语音合成',
   ARRAY['gen.audio'], '{"type":"object","properties":{"duration_sec":{"type":"integer","minimum":1,"maximum":120}}}',
   '{"unit": "second", "price": 0.02, "currency": "CNY"}', true),
  ('60000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001',
   'jimeng/asr-v1', 'jimeng_asr_v1', '即梦语音转文字',
   ARRAY['audio.transcribe'], '{"type":"object","properties":{}}',
   '{"unit": "minute", "price": 0.05, "currency": "CNY"}', true)
ON CONFLICT (model_id) DO NOTHING;

-- minimax model
INSERT INTO account.model_definitions (id, provider_id, model_id, provider_model_id, display_name, task_types, param_schema, pricing, enabled) VALUES
  ('60000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000003',
   'minimax/speech-02', 'speech-02-hd', 'MiniMax 语音合成 HD',
   ARRAY['gen.audio'], '{"type":"object","properties":{"duration_sec":{"type":"integer"}}}',
   '{"unit": "character", "price": 0.01, "currency": "CNY"}', true)
ON CONFLICT (model_id) DO NOTHING;

-- kling model (disabled)
INSERT INTO account.model_definitions (id, provider_id, model_id, provider_model_id, display_name, task_types, param_schema, pricing, enabled) VALUES
  ('60000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000004',
   'kling/video-v1', 'kling_v1', '可灵视频生成',
   ARRAY['gen.video'], '{"type":"object","properties":{"duration_sec":{"type":"integer"},"aspect_ratio":{"type":"string"}}}',
   '{"unit": "second", "price": 0.8, "currency": "CNY"}', false)
ON CONFLICT (model_id) DO NOTHING;

-- ============ CHANNELS (for admin) ============
INSERT INTO account.channels (id, provider_id, slug, display_name, invocation_method, enabled) VALUES
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
   'jimeng-default', '即梦默认通道', 'cli', true),
  ('70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003',
   'minimax-default', 'MiniMax API 通道', 'http', true)
ON CONFLICT (provider_id, slug) DO NOTHING;

COMMIT;

-- Summary
SELECT 'Users: ' || COUNT(*) FROM canvas.users;
SELECT 'Projects: ' || COUNT(*) FROM canvas.projects;
SELECT 'Canvases: ' || COUNT(*) FROM canvas.canvases;
SELECT 'Nodes: ' || COUNT(*) FROM canvas.canvas_nodes;
SELECT 'Edges: ' || COUNT(*) FROM canvas.canvas_edges;
SELECT 'Tasks: ' || COUNT(*) FROM canvas.tasks;
SELECT 'Assets: ' || COUNT(*) FROM canvas.assets;
SELECT 'Providers: ' || COUNT(*) FROM account.providers;
SELECT 'Models: ' || COUNT(*) FROM account.model_definitions;
SELECT 'Channels: ' || COUNT(*) FROM account.channels;
