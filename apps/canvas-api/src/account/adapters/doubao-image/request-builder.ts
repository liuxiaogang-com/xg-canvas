import type { UnifiedRequest } from '@xgcanvas/adapters-contract';

import type { DoubaoImageSubmitRequest } from './types';

const DEFAULT_REQ_KEY = 'high_aes_general_v30l_zt2i';

export function buildDoubaoImageSubmit(req: UnifiedRequest): DoubaoImageSubmitRequest {
  const params = req.params as Record<string, unknown>;
  const [w, h] = parseAspect(params.aspect_ratio, params.resolution);
  return {
    req_key: (params.req_key as string) ?? DEFAULT_REQ_KEY,
    prompt: req.inputs.prompt ?? '',
    model_version: req.provider_model,
    width: w,
    height: h,
    seed: typeof params.seed === 'number' ? params.seed : undefined,
    scale: typeof params.scale === 'number' ? params.scale : undefined,
    ddim_steps: typeof params.steps === 'number' ? params.steps : undefined,
    use_sr: params.upscale === true,
  };
}

function parseAspect(aspect: unknown, resolution: unknown): [number, number] {
  const baseMap: Record<string, number> = { '1k': 1024, '2k': 2048, '4k': 4096 };
  const base = typeof resolution === 'string' ? baseMap[resolution] ?? 1024 : 1024;
  if (typeof aspect !== 'string' || !aspect.includes(':')) return [base, base];
  const [aw, ah] = aspect.split(':').map(Number);
  if (!aw || !ah) return [base, base];
  if (aw === ah) return [base, base];
  if (aw > ah) return [base, Math.round((base * ah) / aw)];
  return [Math.round((base * aw) / ah), base];
}
