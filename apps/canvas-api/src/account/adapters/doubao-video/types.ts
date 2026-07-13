export interface DoubaoVideoSubmitRequest {
  req_key: string;
  prompt: string;
  model_version: string;
  image_url?: string;
  duration?: number;
  resolution?: string;
  ratio?: string;
}

export interface DoubaoVideoSubmitResponse {
  code: number;
  message?: string;
  data?: { task_id: string };
}

export interface DoubaoVideoQueryResponse {
  code: number;
  message?: string;
  data?: {
    status: 'in_queue' | 'generating' | 'done' | 'not_found' | 'expired';
    video_url?: string;
    cover_url?: string;
  };
}
