import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import NodePorts from '../_shared/NodePorts';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { canvasApi } from '../../api/canvas';
import { useCanvasStore } from '../../canvas/canvas-state';
import { toShellStatus, type CanvasNodeData } from '../types';
import { scriptInputSchema, type ScriptInputData } from './schema';

export default function ScriptInputNode({ id, selected, data }: NodeProps) {
  const d = data as ScriptInputData & CanvasNodeData;
  const status = d.status ?? 'idle';
  return (
    <NodeShell
      width={360}
      title={d.title ?? scriptInputSchema.title}
      icon={<NodeIcon type="script_input" />}
      onTitleChange={(t) => renameNode(id, t)}
      status={toShellStatus(status)}
      meta={`${d.raw_text?.length ?? 0} 字`}
      selected={!!selected}
      ports={<NodePorts />}
    >
      <textarea
        value={d.raw_text ?? ''}
        onChange={(e) => {
          const next = e.target.value;
          useCanvasStore.getState().patchNodeData(id, { raw_text: next });
          const projectId = useCanvasStore.getState().projectId;
          if (projectId) canvasApi.updateNode(projectId, id, { data: { raw_text: next } }).catch(() => undefined);
        }}
        placeholder="在此粘贴剧本…"
        rows={8}
        className="nodrag nowheel p-3 text-xs"
        style={{
          background: 'transparent',
          color: 'var(--c-text-on-dark-1)',
          width: '100%',
          resize: 'vertical',
          minHeight: 160,
          outline: 'none',
          border: 'none',
        }}
      />
    </NodeShell>
  );
}
