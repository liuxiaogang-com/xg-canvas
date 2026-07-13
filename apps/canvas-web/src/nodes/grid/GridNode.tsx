import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import NodePorts from '../_shared/NodePorts';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { canvasApi } from '../../api/canvas';
import { useCanvasStore } from '../../canvas/canvas-state';
import { toShellStatus, type CanvasNodeData } from '../types';
import { gridSchema, type GridCell, type GridData } from './schema';

export default function GridNode({ id, selected, data }: NodeProps) {
  const d = data as GridData & CanvasNodeData;
  const status = d.status ?? 'idle';
  const cells = d.cells ?? [];
  return (
    <NodeShell
      width={260}
      title={d.title ?? gridSchema.title}
      icon={<NodeIcon type="grid" />}
      onTitleChange={(t) => renameNode(id, t)}
      meta={`${d.rows}×${d.cols}`}
      status={toShellStatus(status)}
      selected={!!selected}
      ports={<NodePorts />}
    >
      <div
        className="p-1 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${d.cols}, 1fr)`,
          gridTemplateRows: `repeat(${d.rows}, 1fr)`,
          aspectRatio: `${d.cols} / ${d.rows}`,
        }}
      >
        {cells.slice(0, d.rows * d.cols).map((c, i) => (
          <Cell key={i} cell={c} index={i} nodeId={id} cells={cells} />
        ))}
      </div>
    </NodeShell>
  );
}

function Cell({ cell, index, nodeId, cells }: { cell: GridCell; index: number; nodeId: string; cells: GridCell[] }) {
  const url = useAssetUrl(cell.asset_id ?? null);
  return (
    <div
      className="nodrag rounded bg-canvas-panel-2 overflow-hidden text-[10px] flex items-center justify-center cursor-grab"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isNaN(from) || from === index) return;
        const next = [...cells];
        [next[from], next[index]] = [next[index], next[from]];
        useCanvasStore.getState().patchNodeData(nodeId, { cells: next } as never);
        const projectId = useCanvasStore.getState().projectId;
        if (projectId) canvasApi.updateNode(projectId, nodeId, { data: { cells: next } }).catch(() => undefined);
      }}
      style={{ color: 'var(--c-text-on-dark-3)' }}
    >
      {url ? <img src={url} className="w-full h-full object-cover" alt="" /> : <span>{index + 1}</span>}
    </div>
  );
}
