import type { UnifiedRequest } from '@xgcanvas/adapters-contract';

import type { DashScopeImageRequest, DashScopeVideoRequest } from './types';

type Ref = NonNullable<UnifiedRequest['inputs']['references']>[number];
type RefWithUrl = Ref & { url: string };

const IMAGE_PARAM_KEYS = [
  'negative_prompt',
  'size',
  'n',
  'prompt_extend',
  'watermark',
  'seed',
  'thinking_mode',
];

const VIDEO_PARAM_KEYS = ['resolution', 'ratio', 'duration', 'prompt_extend', 'watermark', 'seed'];

export function buildBailianImageRequest(req: UnifiedRequest): DashScopeImageRequest {
  const params = req.params ?? {};
  const content = [
    ...imageReferences(req).map((r) => ({ image: r.url })),
    { text: req.inputs.prompt ?? '' },
  ];
  const parameters = copyParams(params, IMAGE_PARAM_KEYS);
  if (!parameters.size && typeof params.resolution === 'string' && params.resolution.includes('*')) {
    parameters.size = params.resolution;
  }
  return {
    model: req.provider_model,
    input: { messages: [{ role: 'user', content }] },
    parameters,
  };
}

export function buildBailianVideoRequest(req: UnifiedRequest): DashScopeVideoRequest {
  const params = req.params ?? {};
  const input: DashScopeVideoRequest['input'] = {
    prompt: req.inputs.prompt ?? '',
  };
  if (typeof params.negative_prompt === 'string' && params.negative_prompt) {
    input.negative_prompt = params.negative_prompt;
  }

  const media = buildMedia(req);
  if (media.length > 0) {
    input.media = media;
  }

  const parameters = copyParams(params, VIDEO_PARAM_KEYS);
  if (!parameters.ratio && typeof params.aspect_ratio === 'string') {
    parameters.ratio = params.aspect_ratio;
  }
  if (!parameters.duration && typeof params.duration_sec === 'number') {
    parameters.duration = params.duration_sec;
  }

  return { model: req.provider_model, input, parameters };
}

function buildMedia(req: UnifiedRequest): Array<{ type: string; url: string }> {
  const media: Array<{ type: string; url: string }> = [];
  for (const ref of req.inputs.references ?? []) {
    if (!ref.url) continue;
    const type = mediaType(ref.slot);
    if (type) media.push({ type, url: ref.url });
  }
  return media;
}

function imageReferences(req: UnifiedRequest): RefWithUrl[] {
  return (req.inputs.references ?? []).filter((ref): ref is RefWithUrl => {
    if (!ref.url) return false;
    return ref.type === undefined || ref.type === 'image' || ref.type === 'image_list';
  });
}

function mediaType(slot: string): string | null {
  if (slot === 'first_frame' || slot === 'last_frame' || slot === 'first_clip' || slot === 'driving_audio') {
    return slot;
  }
  if (slot === 'source_image') return 'first_frame';
  if (slot === 'reference_image') return 'reference_image';
  if (slot === 'source_video') return 'first_clip';
  return null;
}

function copyParams(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'seed' && value === -1) continue;
    out[key] = value;
  }
  return out;
}
