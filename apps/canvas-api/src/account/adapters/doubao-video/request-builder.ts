import type { UnifiedRequest } from '@xgcanvas/adapters-contract';

import type { DoubaoVideoSubmitRequest } from './types';

const DEFAULT_REQ_KEY = 'jimeng_t2v_v30';

export function buildDoubaoVideoSubmit(req: UnifiedRequest): DoubaoVideoSubmitRequest {
  const params = req.params as Record<string, unknown>;
  const ref = firstReferenceUrl(req, ['source_image', 'first_frame', 'reference_image']);
  return {
    req_key: (params.req_key as string) ?? DEFAULT_REQ_KEY,
    model_version: req.provider_model,
    prompt: req.inputs.prompt ?? '',
    image_url: ref,
    duration: typeof params.duration_sec === 'number' ? params.duration_sec : undefined,
    resolution: typeof params.resolution === 'string' ? params.resolution : undefined,
    ratio: typeof params.aspect_ratio === 'string' ? params.aspect_ratio : undefined,
  };
}

function firstReferenceUrl(req: UnifiedRequest, slots: string[]): string | undefined {
  return (req.inputs.references ?? []).find((r) => r.url && slots.includes(r.slot))?.url;
}
