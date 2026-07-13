import { httpJson } from '../_shared/http-client';
import type {
  BailianCredential,
  DashScopeImageRequest,
  DashScopeImageResponse,
  DashScopeTaskResponse,
  DashScopeTaskSubmitResponse,
  DashScopeVideoRequest,
} from './types';

const DEFAULT_BASE = 'https://dashscope.aliyuncs.com/api/v1';

export class BailianDashscopeClient {
  async generateImage(
    baseUrl: string | undefined,
    req: DashScopeImageRequest,
    cred: BailianCredential,
    signal?: AbortSignal,
  ): Promise<DashScopeImageResponse> {
    const res = await httpJson<DashScopeImageResponse>({
      url: `${base(baseUrl)}/services/aigc/multimodal-generation/generation`,
      headers: authHeaders(cred),
      body: req,
      timeoutMs: 120_000,
      signal,
    });
    return res.data;
  }

  async submitVideo(
    baseUrl: string | undefined,
    req: DashScopeVideoRequest,
    cred: BailianCredential,
    signal?: AbortSignal,
  ): Promise<DashScopeTaskSubmitResponse> {
    const res = await httpJson<DashScopeTaskSubmitResponse>({
      url: `${base(baseUrl)}/services/aigc/video-generation/video-synthesis`,
      headers: { ...authHeaders(cred), 'X-DashScope-Async': 'enable' },
      body: req,
      timeoutMs: 60_000,
      signal,
    });
    return res.data;
  }

  async getTask(
    baseUrl: string | undefined,
    taskId: string,
    cred: BailianCredential,
    signal?: AbortSignal,
  ): Promise<DashScopeTaskResponse> {
    const res = await httpJson<DashScopeTaskResponse>({
      url: `${base(baseUrl)}/tasks/${encodeURIComponent(taskId)}`,
      method: 'GET',
      headers: authHeaders(cred),
      timeoutMs: 30_000,
      signal,
    });
    return res.data;
  }

  async cancelTask(
    baseUrl: string | undefined,
    taskId: string,
    cred: BailianCredential,
    signal?: AbortSignal,
  ): Promise<void> {
    await httpJson({
      url: `${base(baseUrl)}/tasks/${encodeURIComponent(taskId)}/cancel`,
      headers: authHeaders(cred),
      timeoutMs: 30_000,
      signal,
    });
  }
}

function base(baseUrl: string | undefined): string {
  return (baseUrl || DEFAULT_BASE).replace(/\/$/, '');
}

function authHeaders(cred: BailianCredential): Record<string, string> {
  return { Authorization: `Bearer ${cred.apiKey}` };
}
