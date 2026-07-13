import { useEffect, useRef, useState } from 'react';

import { canvasApi } from '../../api/canvas';
import { scriptApi } from '../../api/script';
import { getSchema } from '../../nodes/registry';
import { useCanvasStore } from '../canvas-state';
import { useNodeRunner } from '../hooks/useNodeRunner';
import { toast } from '../../ui';
import AspectRatioPopover, { type AspectRatioValue } from './AspectRatioPopover';
import './NodeDetailPanel.css';

interface Props {
  projectId: string;
  open: boolean;
  onClose(): void;
}

interface NodeDataLike {
  prompt?: string;
  raw_text?: string;
  name?: string;
  model_id?: string | null;
  aspect_ratio?: string;
  resolution?: string;
  width?: number;
  height?: number;
  duration_sec?: number;
  temperature?: number;
}

const NODE_BADGE: Record<string, { label: string; tone: string }> = {
  gen_image: { label: '图像', tone: 'image' },
  gen_video: { label: '视频', tone: 'video' },
  gen_audio: { label: '音频', tone: 'audio' },
  gen_text: { label: '文本', tone: 'text' },
  script_input: { label: '剧本', tone: 'script' },
  storyboard_shot: { label: '分镜', tone: 'shot' },
  entity_character: { label: '角色', tone: 'entity' },
  entity_scene: { label: '场景', tone: 'entity' },
  entity_prop: { label: '道具', tone: 'entity' },
  grid: { label: '网格', tone: 'grid' },
};

/** Node detail / prompt editor — dark glass panel matching .pen
 * `canvas-web/overlay/prompt-editor-expanded`. Centered overlay; backdrop dim
 * is light so user can still see the canvas behind. */
export default function NodeDetailPanel({ projectId, open, onClose }: Props) {
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === selectedId));
  const schema = node ? getSchema(node.type ?? '') : null;
  const data = (node?.data ?? {}) as NodeDataLike;
  const runner = useNodeRunner();

  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<Partial<AspectRatioValue>>({});
  const [showAspect, setShowAspect] = useState(false);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate local state when the panel opens or the selected node changes.
  useEffect(() => {
    if (!open || !node) return;
    const initialPrompt = data.prompt ?? data.raw_text ?? data.name ?? '';
    setPrompt(initialPrompt);
    setAspect({
      ratio: data.aspect_ratio,
      resolution: data.resolution,
      width: data.width,
      height: data.height,
    });
    setShowAspect(false);
    // Focus & select prompt for instant editing.
    setTimeout(() => textareaRef.current?.focus(), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId]);

  // ESC closes; click outside also closes via backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !node || !schema) return null;

  const badge = NODE_BADGE[node.type ?? ''] ?? { label: schema.title, tone: 'default' };
  const supportsPrompt = node.type !== 'grid' && node.type !== 'storyboard_shot';
  const supportsAspect = node.type === 'gen_image' || node.type === 'gen_video';

  const persist = async () => {
    if (!supportsPrompt) return;
    const field = node.type === 'script_input' ? 'raw_text' : 'prompt';
    if ((data as Record<string, unknown>)[field] === prompt) return;
    useCanvasStore.getState().patchNodeData(node.id, { [field]: prompt } as never);
    try {
      await canvasApi.updateNode(projectId, node.id, { data: { [field]: prompt } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onAspectChange = async (next: AspectRatioValue) => {
    setAspect(next);
    if (!supportsAspect) return;
    const patch = {
      aspect_ratio: next.ratio,
      resolution: next.resolution,
      width: next.width,
      height: next.height,
    };
    useCanvasStore.getState().patchNodeData(node.id, patch as never);
    try {
      await canvasApi.updateNode(projectId, node.id, { data: patch });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleSend = async () => {
    setBusy(true);
    try {
      await persist();
      runner.submit(node.id, projectId);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const aspectLabel =
    aspect.ratio || aspect.resolution
      ? `${aspect.ratio ?? ''}${aspect.resolution ? ' · ' + aspect.resolution : ''}`.trim()
      : '比例';

  // Toolbar: wrap the selection / prefix the line with markdown, or AI-rewrite.
  const surround = (mark: string, end = mark) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = prompt.slice(s, e) || '文字';
    setPrompt(prompt.slice(0, s) + mark + sel + end + prompt.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + mark.length, s + mark.length + sel.length);
    });
  };
  const prefixLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const ls = prompt.lastIndexOf('\n', s - 1) + 1;
    setPrompt(prompt.slice(0, ls) + prefix + prompt.slice(ls));
    requestAnimationFrame(() => ta.focus());
  };
  const aiRewrite = async () => {
    if (!node || !prompt.trim() || busy) return;
    setBusy(true);
    try {
      const r = await scriptApi.optimize({ project_id: projectId, script_node_id: node.id, raw_text: prompt });
      setPrompt(r.optimized_text || prompt);
      toast.success('已用 AI 改写，记得保存');
    } catch (e) {
      toast.error((e as Error).message || 'AI 改写失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="node-detail-backdrop" onClick={onClose}>
      <div
        className="node-detail"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="node-detail__topbar">
          <button type="button" className="ndt-tool" onClick={() => prefixLine('# ')} title="标题 H1">H1</button>
          <button type="button" className="ndt-tool" onClick={() => prefixLine('## ')} title="标题 H2">H2</button>
          <button type="button" className="ndt-tool" onClick={() => prefixLine('### ')} title="标题 H3">H3</button>
          <span className="ndt-sep" />
          <button type="button" className="ndt-tool" onClick={() => surround('**')} title="加粗"><b>B</b></button>
          <button type="button" className="ndt-tool" onClick={() => surround('*')} title="斜体"><i>I</i></button>
          <span className="ndt-sep" />
          <button type="button" className="ndt-tool" onClick={() => prefixLine('- ')} title="无序列表">
            <NdtIcon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </button>
          <button type="button" className="ndt-tool" onClick={() => surround('[', '](https://)')} title="插入链接">
            <NdtIcon d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
          </button>
          <span className="ndt-sep" />
          <button type="button" className="ndt-tool ndt-tool--ai" onClick={aiRewrite} disabled={busy} title="AI 改写">
            <NdtIcon d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
          </button>
          <button type="button" className="ndt-tool ndt-tool--close" onClick={onClose} title="关闭">
            <NdtIcon d="M6 6l12 12M18 6L6 18" />
          </button>
        </header>

        <div className="node-detail__body">
          <div className={`node-detail__thumb node-detail__thumb--${badge.tone}`}>
            <span className="node-detail__thumb-tag">{badge.label}</span>
          </div>
          <div className="node-detail__editor">
            <div className="node-detail__title">{(node.data as { name?: string }).name ?? schema.title}</div>
            {supportsPrompt ? (
              <textarea
                ref={textareaRef}
                className="node-detail__prompt"
                placeholder="输入提示词、上下文或剧本…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={persist}
              />
            ) : (
              <div className="node-detail__hint">该节点没有 prompt — 请连入上游或在画布中编辑。</div>
            )}
          </div>
        </div>

        <footer className="node-detail__footer">
          <div className="node-detail__model">
            <span className="node-detail__model-dot" />
            {data.model_id ?? '未指定模型'}
          </div>
          <div className="node-detail__chips">
            {supportsAspect && (
              <span className="node-detail__chip-wrap">
                <button
                  type="button"
                  className="node-chip"
                  onClick={() => setShowAspect((v) => !v)}
                >
                  ▢ {aspectLabel}
                </button>
                {showAspect && (
                  <div className="node-detail__aspect">
                    <AspectRatioPopover value={aspect} onChange={onAspectChange} />
                  </div>
                )}
              </span>
            )}
            {node.type === 'gen_video' && (
              <span className="node-chip">⏱ {data.duration_sec ?? 5}s</span>
            )}
            {node.type === 'gen_text' && data.temperature !== undefined && (
              <span className="node-chip">🌡 {data.temperature}</span>
            )}
          </div>
          <div className="node-detail__send-wrap">
            <button type="button" className="node-detail__icon-btn" title="语音">🎙</button>
            <button type="button" className="node-detail__icon-btn" title="表情">☻</button>
            <button
              type="button"
              className="node-detail__send"
              onClick={handleSend}
              disabled={busy}
              aria-label="发送"
            >
              {busy ? '…' : '↑'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function NdtIcon({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
