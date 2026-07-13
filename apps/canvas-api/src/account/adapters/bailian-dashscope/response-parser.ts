import type { AssetStub } from '@xgcanvas/adapters-contract';

import type {
  DashScopeImageResponse,
  DashScopeTaskResponse,
  ParsedTaskStatus,
} from './types';

export function parseImageAssets(res: DashScopeImageResponse): AssetStub[] {
  const urls: string[] = [];
  for (const choice of res.output?.choices ?? []) {
    for (const part of choice.message?.content ?? []) {
      const url = part.image ?? part.url;
      if (url) urls.push(url);
    }
  }
  for (const result of res.output?.results ?? []) {
    const url = result.image ?? result.url;
    if (url) urls.push(url);
  }
  return urls.map((url, i) => ({
    url,
    mime_type: 'image/png',
    filename: `bailian-image-${i + 1}.png`,
    role: 'main',
  }));
}

export function parseTaskStatus(res: DashScopeTaskResponse): ParsedTaskStatus {
  const output = res.output;
  const status = output?.task_status;
  if (status === 'PENDING' || status === 'RUNNING') {
    return { status: 'running', assets: [] };
  }
  if (status === 'SUCCEEDED') {
    return { status: 'succeeded', assets: parseTaskAssets(res) };
  }
  return {
    status: 'failed',
    assets: [],
    errorMessage: output?.message ?? res.message ?? `bailian task ${status ?? 'failed'}`,
    vendor: res,
  };
}

function parseTaskAssets(res: DashScopeTaskResponse): AssetStub[] {
  const urls: string[] = [];
  if (res.output?.video_url) urls.push(res.output.video_url);
  for (const result of res.output?.results ?? []) {
    const url = result.video_url ?? result.url;
    if (url) urls.push(url);
  }
  return urls.map((url, i) => ({
    url,
    mime_type: mimeFromUrl(url),
    filename: `bailian-result-${i + 1}${extensionFromUrl(url)}`,
    role: i === 0 ? 'main' : `result_${i}`,
  }));
}

function mimeFromUrl(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}

function extensionFromUrl(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  const match = lower.match(/\.(png|jpg|jpeg|webp|mp4|webm)$/);
  return match ? `.${match[1]}` : '.bin';
}
