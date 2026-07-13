import { api, ensureRefresh } from './client';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  latency_ms?: number | null;
  request_id?: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  model_id: string | null;
  system_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendBody {
  conversation_id?: string;
  model_id: string;
  message: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
}

/** Server-sent events for one streaming turn (mirror of ChatService.ChatStreamEvent). */
export interface ChatStreamHandlers {
  onMeta?: (conversationId: string) => void;
  onDelta?: (d: { text?: string; reasoning?: string }) => void;
  onDone?: (d: {
    message_id: string;
    usage: ChatMessage['usage'];
    latency_ms: number;
    request_id?: string;
  }) => void;
  onError?: (message: string, requestId?: string) => void;
}

/**
 * POST /chat/stream and consume the SSE body via a fetch ReadableStream. Each frame is
 * `data: <json>\n\n`; the stream ends with `data: [DONE]`. Resolves when the stream closes.
 */
async function streamChat(body: SendBody, h: ChatStreamHandlers, signal?: AbortSignal): Promise<void> {
  const open = () =>
    fetch('/api/v1/chat/stream', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  let res = await open();
  // SSE bypasses api(); handle its 401 with the same single-flight refresh + one replay.
  if (res.status === 401) {
    const ok = await ensureRefresh();
    if (ok) res = await open();
  }
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    h.onError?.(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let ev: { type: string; [k: string]: unknown };
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'meta') h.onMeta?.(ev.conversation_id as string);
      else if (ev.type === 'delta') h.onDelta?.({ text: ev.text as string, reasoning: ev.reasoning as string });
      else if (ev.type === 'done')
        h.onDone?.({
          message_id: ev.message_id as string,
          usage: ev.usage as ChatMessage['usage'],
          latency_ms: ev.latency_ms as number,
          request_id: ev.request_id as string | undefined,
        });
      else if (ev.type === 'error') h.onError?.(ev.message as string, ev.request_id as string | undefined);
    }
  }
}

export const chatApi = {
  conversations: () => api<Conversation[]>('/chat/conversations'),
  messages: (id: string) => api<ChatMessage[]>(`/chat/conversations/${id}/messages`),
  remove: (id: string) => api<void>(`/chat/conversations/${id}`, { method: 'DELETE' }),
  send: (body: SendBody) =>
    api<{ conversation_id: string; message: ChatMessage }>('/chat/messages', { method: 'POST', body }),
  stream: streamChat,
};
