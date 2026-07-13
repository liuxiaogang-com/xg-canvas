import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import NodePorts from './NodePorts';
import { renameNode } from './rename';
import { NodeIcon } from '../node-icons';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { toShellStatus, type CanvasNodeData } from '../types';

interface EntityNodeData extends CanvasNodeData {
  name: string;
  description?: string;
}

interface Props extends NodeProps {
  title: string;
  entityKind: 'character' | 'scene' | 'prop';
}

export function EntityNodeShell({ id, selected, data, title, entityKind }: Props) {
  const d = data as EntityNodeData;
  const url = useAssetUrl(d.output_asset_id ?? null);
  const status = d.status ?? 'idle';
  return (
    <NodeShell
      width={240}
      title={d.title ?? title}
      icon={<NodeIcon type={`entity_${entityKind}`} />}
      onTitleChange={(t) => renameNode(id, t)}
      status={toShellStatus(status)}
      selected={!!selected}
      ports={<NodePorts />}
    >
      <div>
        <div className="aspect-square">
          {url ? (
            <img src={url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="node-ph" />
          )}
        </div>
        <div className="p-2">
          <div className="text-xs text-text-1 truncate">{d.name || '未命名'}</div>
          <div className="text-[10px] text-text-3 line-clamp-2">{d.description || ''}</div>
        </div>
      </div>
      <span className="hidden">{entityKind}</span>
    </NodeShell>
  );
}
