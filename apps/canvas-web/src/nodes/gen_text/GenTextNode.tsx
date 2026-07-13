import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import NodePorts from '../_shared/NodePorts';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { toShellStatus, type CanvasNodeData } from '../types';
import { useCanvasStore } from '../../canvas/canvas-state';
import { genTextSchema, type GenTextData } from './schema';

export default function GenTextNode({ id, selected, data }: NodeProps) {
  const d = data as GenTextData & CanvasNodeData;
  const status = d.status ?? 'idle';
  return (
    <NodeShell
      width={280}
      title={d.title ?? genTextSchema.title}
      icon={<NodeIcon type="gen_text" />}
      onTitleChange={(t) => renameNode(id, t)}
      meta={d.model_id ?? ''}
      status={toShellStatus(status)}
      statusLabel={status === 'idle' ? '空闲' : status}
      selected={!!selected}
      ports={<NodePorts />}
    >
      <div className="p-3 text-xs" style={{ minHeight: 96, maxHeight: 220, overflow: 'auto' }}>
        {d.output_text ? (
          <pre className="whitespace-pre-wrap text-[12px] m-0">{d.output_text}</pre>
        ) : (
          <span style={{ color: 'var(--c-text-on-dark-3)' }}>
            {d.prompt || '未输入提示词。选中后在下方表单编辑。'}
          </span>
        )}
      </div>
    </NodeShell>
  );
}

// Side-effect helper: marks selectedNodeId in store on click.
export function bindSelectionHandler(_id: string) {
  return useCanvasStore.getState().setSelected;
}
