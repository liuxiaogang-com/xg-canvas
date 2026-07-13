import { api } from './client';

export interface AgentReply {
  session_id: string;
  reply_text: string;
  patch:
    | {
        explanation?: string;
        patch?: { data?: Record<string, unknown> };
        create_node?: { type: string; data: Record<string, unknown> };
        trigger_regenerate?: boolean;
      }
    | null;
  raw: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export const agentApi = {
  message: (body: {
    project_id: string;
    session_id?: string;
    message: string;
    model_id?: string;
    node_context?: { id: string; type: string; data: Record<string, unknown> };
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) => api<AgentReply>('/agent/messages', { method: 'POST', body }),
};
