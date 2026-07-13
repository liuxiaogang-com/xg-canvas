import type { AssetStub } from '@xgcanvas/adapters-contract';

export interface BailianCredential {
  apiKey: string;
}

export interface DashScopeContentPart {
  text?: string;
  image?: string;
}

export interface DashScopeImageRequest {
  model: string;
  input: {
    messages: Array<{
      role: 'user';
      content: DashScopeContentPart[];
    }>;
  };
  parameters?: Record<string, unknown>;
}

export interface DashScopeVideoRequest {
  model: string;
  input: {
    prompt?: string;
    negative_prompt?: string;
    audio_url?: string;
    media?: Array<{ type: string; url: string }>;
  };
  parameters?: Record<string, unknown>;
}

export interface DashScopeImageResponse {
  request_id?: string;
  code?: string;
  message?: string;
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string; url?: string; type?: string }>;
      };
    }>;
    results?: Array<{ url?: string; image?: string; code?: string; message?: string }>;
  };
  usage?: Record<string, unknown>;
}

export interface DashScopeTaskSubmitResponse {
  request_id?: string;
  code?: string;
  message?: string;
  output?: {
    task_id?: string;
    task_status?: DashScopeTaskStatus;
  };
}

export type DashScopeTaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'UNKNOWN';

export interface DashScopeTaskResponse {
  request_id?: string;
  code?: string;
  message?: string;
  output?: {
    task_id?: string;
    task_status?: DashScopeTaskStatus;
    code?: string;
    message?: string;
    video_url?: string;
    results?: Array<{ url?: string; video_url?: string; code?: string; message?: string }>;
    task_metrics?: Record<string, number>;
  };
  usage?: Record<string, unknown>;
}

export interface ParsedTaskStatus {
  status: 'running' | 'succeeded' | 'failed';
  assets: AssetStub[];
  errorMessage?: string;
  vendor?: unknown;
}
