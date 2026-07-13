/** Frontend mirror of backend readiness catalog — ids must stay in sync. */

export type ReadinessItemId =
  | 'object_storage'
  | 'mail'
  | 'modality_text'
  | 'modality_image'
  | 'modality_video'
  | 'modality_audio'
  | 'capability_tools'
  | 'feature_agent';

export type ReadinessStatus = 'ready' | 'missing' | 'unverified' | 'planned';
export type ReadinessSurface =
  | 'canvas'
  | 'generate'
  | 'assets'
  | 'chat'
  | 'agent'
  | 'auth_email';

export interface ReadinessCatalogEntry {
  id: ReadinessItemId;
  title: string;
  hint: string;
  href: string;
  adminCap: string;
  surfaces: ReadinessSurface[];
  planned?: boolean;
}

export const READINESS_CATALOG: ReadinessCatalogEntry[] = [
  {
    id: 'object_storage',
    title: '对象存储',
    hint: '生成资产与上传素材需要 S3/R2 兼容存储，并完成连通测试',
    href: '/settings/object-storage',
    adminCap: 'system.config.manage',
    surfaces: ['canvas', 'generate', 'assets'],
  },
  {
    id: 'mail',
    title: '邮件通道',
    hint: '通知、验证码与密码相关流程需要可用的 SMTP',
    href: '/settings/mail',
    adminCap: 'system.config.manage',
    surfaces: ['auth_email'],
  },
  {
    id: 'modality_text',
    title: '文本模型',
    hint: '对话与 Agent 需要至少一个可用的文本模型',
    href: '/settings/credentials?add=1&modality=text',
    adminCap: 'system.credential.manage',
    surfaces: ['chat', 'agent'],
  },
  {
    id: 'modality_image',
    title: '生图模型',
    hint: '快速生成与画布生图需要至少一个可用的图像模型',
    href: '/settings/credentials?add=1&modality=image',
    adminCap: 'system.credential.manage',
    surfaces: ['canvas', 'generate'],
  },
  {
    id: 'modality_video',
    title: '生视频模型',
    hint: '快速生成与画布生视频需要至少一个可用的视频模型',
    href: '/settings/credentials?add=1&modality=video',
    adminCap: 'system.credential.manage',
    surfaces: ['canvas', 'generate'],
  },
  {
    id: 'modality_audio',
    title: '音频模型',
    hint: '预留：音频节点入口将按就绪状态显示',
    href: '/settings/credentials?add=1&modality=audio',
    adminCap: 'system.credential.manage',
    surfaces: ['canvas', 'generate'],
    planned: true,
  },
  {
    id: 'capability_tools',
    title: '功能型模型',
    hint: '预留：放大 / 切分等工具能力',
    href: '/settings/models',
    adminCap: 'system.model.manage',
    surfaces: ['canvas'],
    planned: true,
  },
  {
    id: 'feature_agent',
    title: 'Agent 功能配置',
    hint: '预留：功能模型池 resolve',
    href: '/settings/feature-config',
    adminCap: 'system.config.manage',
    surfaces: ['agent'],
    planned: true,
  },
];

export const READINESS_BY_ID = Object.fromEntries(
  READINESS_CATALOG.map((e) => [e.id, e]),
) as Record<ReadinessItemId, ReadinessCatalogEntry>;

/** Surface → required item ids (non-planned). */
export function requiredIdsForSurface(surface: ReadinessSurface): ReadinessItemId[] {
  return READINESS_CATALOG.filter((e) => !e.planned && e.surfaces.includes(surface)).map((e) => e.id);
}

/** Quick-gen mode → required readiness items. */
export function requiredIdsForGenMode(mode: 'image' | 'video' | 'text' | 'audio'): ReadinessItemId[] {
  if (mode === 'text') return ['modality_text'];
  if (mode === 'audio') return ['object_storage', 'modality_audio'];
  if (mode === 'video') return ['object_storage', 'modality_video'];
  return ['object_storage', 'modality_image'];
}
