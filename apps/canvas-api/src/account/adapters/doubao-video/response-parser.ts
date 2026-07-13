import type { AssetStub } from '@xgcanvas/adapters-contract';

import type { DoubaoVideoQueryResponse } from './types';

export interface ParsedVideoStatus {
  status: 'running' | 'succeeded' | 'failed';
  videoStub?: AssetStub;
  coverStub?: AssetStub;
  errorMessage?: string;
}

export function parseDoubaoVideoStatus(res: DoubaoVideoQueryResponse): ParsedVideoStatus {
  if (res.code !== 10000 || !res.data) {
    return { status: 'failed', errorMessage: res.message ?? `doubao code ${res.code}` };
  }
  const s = res.data.status;
  if (s === 'done' && res.data.video_url) {
    return {
      status: 'succeeded',
      videoStub: { url: res.data.video_url, mime_type: 'video/mp4', role: 'main' },
      coverStub: res.data.cover_url
        ? { url: res.data.cover_url, mime_type: 'image/jpeg', role: 'cover' }
        : undefined,
    };
  }
  if (s === 'not_found' || s === 'expired') {
    return { status: 'failed', errorMessage: `task ${s}` };
  }
  return { status: 'running' };
}
