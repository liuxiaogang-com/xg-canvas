import type { AssetStub } from '@xgcanvas/adapters-contract';

import type { DoubaoImageQueryResponse } from './types';

export interface ParsedDoubaoStatus {
  status: 'running' | 'succeeded' | 'failed';
  assets: AssetStub[];
  errorMessage?: string;
}

export function parseDoubaoStatus(res: DoubaoImageQueryResponse): ParsedDoubaoStatus {
  if (res.code !== 10000 || !res.data) {
    return {
      status: 'failed',
      assets: [],
      errorMessage: res.message ?? `doubao code ${res.code}`,
    };
  }
  const s = res.data.status;
  if (s === 'done') {
    return {
      status: 'succeeded',
      assets: (res.data.image_urls ?? []).map((url, i) => ({
        url,
        mime_type: 'image/png',
        role: i === 0 ? 'main' : `alt_${i}`,
      })),
    };
  }
  if (s === 'not_found' || s === 'expired') {
    return { status: 'failed', assets: [], errorMessage: `task ${s}` };
  }
  return { status: 'running', assets: [] };
}
