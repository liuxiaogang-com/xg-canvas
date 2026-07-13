import { useState } from 'react';

import { canvasApi } from '../../../api/canvas';
import { getSchema } from '../../../nodes/registry';
import { toast } from '../../../ui';
import { useCanvasStore } from '../../canvas-state';

interface Props {
  projectId: string;
}

/**
 * Empty-state pill: a single textarea that creates a node with the prompt.
 * Default to gen_image (most common quick action). Mode switching for
 * other types is reachable through LeftDock + node click.
 */
export default function QuickAddInput({ projectId }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入提示词，自动添加节点"
        className="flex-1 bg-canvas-panel-2 rounded-full px-4 py-2 outline-none border border-canvas-border-soft focus:border-accent text-text-1 text-sm"
        onKeyDown={async (e) => {
          if (e.key !== 'Enter' || !text.trim() || busy) return;
          setBusy(true);
          try {
            const schema = getSchema('gen_image')!;
            const node = await canvasApi.createNode(projectId, {
              type: 'gen_image',
              position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 },
              data: { ...schema.defaultData, prompt: text.trim() } as never,
            });
            useCanvasStore.getState().setNodes((prev) => [
              ...prev,
              { id: node.id, type: node.type, position: node.position, data: node.data as never },
            ]);
            setText('');
          } catch (err) {
            toast.error((err as Error).message || '添加节点失败');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
