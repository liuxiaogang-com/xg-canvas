import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import NodePorts from '../_shared/NodePorts';
import WidthResizer from '../_shared/WidthResizer';
import { aspectCss, resolveAspectRatio } from '../_shared/aspect';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { toShellStatus, type CanvasNodeData } from '../types';
import { genImageSchema, type GenImageData } from './schema';

export default function GenImageNode({ id, selected, data }: NodeProps) {
  const d = data as GenImageData & CanvasNodeData & { width?: number; ratio?: string };
  const status = d.status ?? 'idle';
  const url = useAssetUrl(d.output_asset_id ?? null);
  const ratio = resolveAspectRatio(d as Record<string, unknown>) ?? d.aspect_ratio;
  return (
    <NodeShell
      width={typeof d.width === 'number' ? d.width : 260}
      title={d.title ?? genImageSchema.title}
      icon={<NodeIcon type="gen_image" />}
      onTitleChange={(t) => renameNode(id, t)}
      meta={`${ratio} · ${d.resolution}`}
      status={toShellStatus(status)}
      statusLabel={status === 'idle' ? '空闲' : status}
      selected={!!selected}
      ports={
        <>
          <WidthResizer id={id} visible={!!selected} />
          <NodePorts />
        </>
      }
    >
      <div style={{ aspectRatio: aspectCss(ratio) }}>
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : status === 'running' ? (
          <div
            className="w-full h-full flex items-center justify-center text-[11px]"
            style={{ color: 'var(--c-text-on-dark-3)' }}
          >
            生成中…
          </div>
        ) : (
          <div className="node-ph" />
        )}
      </div>
    </NodeShell>
  );
}
