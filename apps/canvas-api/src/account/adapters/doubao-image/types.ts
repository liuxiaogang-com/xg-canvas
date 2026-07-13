/** Doubao 图像生成 API 子集 (Volcengine). */

export interface DoubaoImageSubmitRequest {
  req_key: string;
  prompt: string;
  model_version: string;
  width?: number;
  height?: number;
  seed?: number;
  scale?: number;
  ddim_steps?: number;
  use_sr?: boolean;
}

export interface DoubaoImageSubmitResponse {
  code: number;
  message?: string;
  data?: { task_id: string };
}

export interface DoubaoImageQueryResponse {
  code: number;
  message?: string;
  data?: {
    status: 'in_queue' | 'generating' | 'done' | 'not_found' | 'expired';
    image_urls?: string[];
  };
}
