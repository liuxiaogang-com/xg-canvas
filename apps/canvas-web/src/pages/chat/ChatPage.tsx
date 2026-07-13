import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { chatApi, type ChatMessage, type Conversation } from '../../api/chat';
import { modelApi, type RichModelSummary } from '../../api/model';
import { toast } from '../../ui';
import MarkdownMessage from './MarkdownMessage';
import './chat.css';

/** 对话 page — real DeepSeek chat: streaming tokens, a collapsible thinking panel
 *  (reasoner chain-of-thought), token/time meta, and refresh-safe persistence. */
export default function ChatPage() {
  const navigate = useNavigate();
  const { conversationId: routeConvId } = useParams<{ conversationId?: string }>();
  const [models, setModels] = useState<RichModelSummary[]>([]);
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convsLoaded, setConvsLoaded] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [openThink, setOpenThink] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const conversationLoadSeqRef = useRef(0);
  const streamingCreatedConvRef = useRef<string | null>(null);

  const reloadConvs = useCallback(async () => {
    try {
      setConvs(await chatApi.conversations());
    } catch {
      // The chat page can still open; errors surface when the user sends or opens a thread.
    } finally {
      setConvsLoaded(true);
    }
  }, []);

  const loadConversation = useCallback(async (id: string, conversation?: Conversation) => {
    const loadSeq = ++conversationLoadSeqRef.current;
    setConvId(id);
    setStreamingId(null);
    setOpenThink({});
    try {
      const nextMessages = await chatApi.messages(id);
      if (loadSeq !== conversationLoadSeqRef.current || window.location.pathname !== `/chat/${id}`) return;
      setMessages(nextMessages);
      if (conversation?.model_id) setModelId(conversation.model_id);
      if (conversation) setSystemPrompt(conversation.system_prompt ?? '');
    } catch (e) {
      toast.error((e as Error).message || '加载对话失败');
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    modelApi
      .list('gen.text')
      .then((m) => {
        setModels(m);
        if (m[0]) setModelId(m[0].id);
      })
      .catch(() => undefined);
    void reloadConvs();
  }, [reloadConvs]);

  useEffect(() => {
    if (!convsLoaded) return;
    if (!routeConvId) {
      conversationLoadSeqRef.current += 1;
      if (convId && !sending && !streamingId) {
        setConvId(null);
        setMessages([]);
        setOpenThink({});
      }
      return;
    }
    if (routeConvId === convId) return;
    if (routeConvId === streamingCreatedConvRef.current && (sending || streamingId)) return;
    const conversation = convs.find((c) => c.id === routeConvId);
    void loadConversation(routeConvId, conversation);
  }, [convId, convs, convsLoaded, loadConversation, routeConvId, sending, streamingId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openConv = (c: Conversation) => {
    navigate(`/chat/${c.id}`);
  };

  const newChat = () => {
    conversationLoadSeqRef.current += 1;
    navigate('/chat');
    setConvId(null);
    setMessages([]);
    setOpenThink({});
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !modelId || sending) return;
    setSending(true);
    setInput('');
    const stamp = Date.now();
    const userTmp: ChatMessage = {
      id: `tmp-u-${stamp}`,
      conversation_id: convId ?? '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    const asstId = `tmp-a-${stamp}`;
    const asstTmp: ChatMessage = {
      id: asstId,
      conversation_id: convId ?? '',
      role: 'assistant',
      content: '',
      reasoning: '',
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userTmp, asstTmp]);
    setStreamingId(asstId);

    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((list) => list.map((m) => (m.id === asstId ? fn(m) : m)));

    let firstConv = convId;
    try {
      await chatApi.stream(
        {
          conversation_id: convId ?? undefined,
          model_id: modelId,
          message: text,
          system_prompt: systemPrompt || undefined,
          temperature,
        },
        {
          onMeta: (cid) => {
            firstConv = cid;
            if (!convId) {
              streamingCreatedConvRef.current = cid;
              setConvId(cid);
              navigate(`/chat/${cid}`, { replace: true });
            }
          },
          onDelta: ({ text: t, reasoning: r }) =>
            patch((m) => ({
              ...m,
              content: m.content + (t ?? ''),
              reasoning: (m.reasoning ?? '') + (r ?? ''),
            })),
          onDone: (d) =>
            patch((m) => ({
              ...m,
              id: d.message_id || m.id,
              usage: d.usage,
              latency_ms: d.latency_ms,
              request_id: d.request_id ?? null,
            })),
          onError: (msg, rid) =>
            patch((m) => ({ ...m, content: m.content || `[生成失败] ${msg}`, request_id: rid ?? null })),
        },
      );
      if (!convId && firstConv) void reloadConvs();
    } catch (e) {
      toast.error((e as Error).message);
      patch((m) => ({ ...m, content: m.content || `[生成失败] ${(e as Error).message}` }));
    } finally {
      streamingCreatedConvRef.current = null;
      setStreamingId(null);
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const tokens = (m: ChatMessage) => (m.usage?.input_tokens ?? 0) + (m.usage?.output_tokens ?? 0);
  const thinkOpen = (m: ChatMessage) => openThink[m.id] ?? m.id === streamingId;
  const toggleThink = (id: string) => setOpenThink((s) => ({ ...s, [id]: !(s[id] ?? id === streamingId) }));

  return (
    <div className="chat">
      <aside className="chat__side">
        <button type="button" className="chat__new" onClick={newChat}>
          + 新对话
        </button>
        <div className="chat__convs">
          {convs.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chat__conv${c.id === convId ? ' is-active' : ''}`}
              onClick={() => openConv(c)}
              title={c.title}
            >
              {c.title || '新对话'}
            </button>
          ))}
        </div>
      </aside>

      <main className="chat__main">
        <header className="chat__bar">
          <select className="chat__model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
          <input
            className="chat__sys"
            placeholder="系统提示词(可选)"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          <label className="chat__temp">
            温度 {temperature.toFixed(1)}
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </label>
        </header>

        <div className="chat__msgs">
          {messages.length === 0 ? <div className="chat__empty">开始一段对话</div> : null}
          {messages.map((m) => (
            <div key={m.id} className={`chat__msg chat__msg--${m.role}`}>
              {m.role === 'assistant' && m.reasoning ? (
                <div className="chat__think">
                  <button type="button" className="chat__think-toggle" onClick={() => toggleThink(m.id)}>
                    <svg
                      className={`chat__chev${thinkOpen(m) ? ' is-open' : ''}`}
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    {m.id === streamingId && !m.content ? '思考中…' : '思考过程'}
                  </button>
                  {thinkOpen(m) ? <div className="chat__think-body">{m.reasoning}</div> : null}
                </div>
              ) : null}
              <div className={`chat__bubble${m.role === 'assistant' ? ' chat__bubble--markdown' : ''}`}>
                {m.role === 'assistant' ? <MarkdownMessage content={m.content} /> : m.content}
                {m.id === streamingId ? <span className="chat__caret" /> : null}
              </div>
              {m.role === 'assistant' && (m.usage || m.latency_ms) ? (
                <div className="chat__meta">
                  {m.usage ? `${tokens(m)} tokens` : ''}
                  {m.latency_ms ? ` · ${(m.latency_ms / 1000).toFixed(1)}s` : ''}
                  {m.request_id ? ` · req ${m.request_id.slice(0, 8)}` : ''}
                </div>
              ) : null}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="chat__composer">
          <textarea
            className="chat__input"
            placeholder="输入消息,Enter 发送 / Shift+Enter 换行"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={2}
          />
          <button type="button" className="chat__send" onClick={send} disabled={sending || !input.trim()}>
            {sending ? '生成中…' : '发送'}
          </button>
        </div>
      </main>
    </div>
  );
}
