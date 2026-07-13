import { useMemo, useState } from 'react';
import { toast } from '../../ui';
import { agentApi, type AgentReply } from '../../api/agent';
import { canvasApi } from '../../api/canvas';
import { getSchema } from '../../nodes/registry';
import { useCanvasStore } from '../canvas-state';
import { useNodeRunner } from '../hooks/useNodeRunner';
import Composer from './Composer';
import ContextBadge from './ContextBadge';
import MessageList from './MessageList';
import SuggestionChips from './SuggestionChips';
import type { ChatTurn } from './types';

interface Props {
  projectId: string;
}

export default function AgentPanel({ projectId }: Props) {
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === selectedId));
  const schema = useMemo(() => (node ? getSchema(node.type ?? '') : null), [node]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const runner = useNodeRunner();

  const send = async (text: string) => {
    setTurns((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const r: AgentReply = await agentApi.message({
        project_id: projectId,
        session_id: sessionId,
        message: text,
        node_context: node ? { id: node.id, type: node.type ?? '', data: node.data as never } : undefined,
        history: turns.map((t) => ({ role: t.role, content: t.content })),
      });
      setSessionId(r.session_id);
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: r.patch?.explanation ?? r.reply_text, patch: r.patch },
      ]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const apply = async (idx: number) => {
    const t = turns[idx];
    const patch = t?.patch;
    if (!patch) return;
    try {
      if (patch.create_node) {
        const created = await canvasApi.createNode(projectId, {
          type: patch.create_node.type,
          position: { x: 280 + Math.random() * 200, y: 280 + Math.random() * 200 },
          data: patch.create_node.data,
        });
        useCanvasStore.getState().setNodes((prev) => [
          ...prev,
          { id: created.id, type: created.type, position: created.position, data: created.data as never },
        ]);
        return;
      }
      if (patch.patch?.data && node) {
        useCanvasStore.getState().patchNodeData(node.id, patch.patch.data as never);
        await canvasApi.updateNode(projectId, node.id, { data: patch.patch.data });
        if (patch.trigger_regenerate) runner.submit(node.id, projectId);
      }
    } catch (e) {
      toast.error((e as Error).message || '应用建议失败');
    }
  };

  return (
    <aside
      className="absolute right-4 top-20 bottom-24 w-[340px] z-10 flex flex-col rounded-2xl"
      style={{
        background: 'var(--c-glass)',
        border: '1px solid var(--c-glass-stroke)',
        backdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <header className="px-3 py-2 border-b border-canvas-border-soft text-sm text-text-1">Agent</header>
      <ContextBadge nodeId={node?.id ?? null} nodeTitle={schema?.title ?? null} />
      <MessageList turns={turns} onApply={apply} />
      <SuggestionChips suggestions={schema?.agentSuggestions ?? []} onPick={send} />
      <Composer loading={loading} onSend={send} />
    </aside>
  );
}
