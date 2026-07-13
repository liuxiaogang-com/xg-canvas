import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import { LazyVideoPlayer } from '../../components/media-player';
import NodePorts from '../_shared/NodePorts';
import WidthResizer from '../_shared/WidthResizer';
import { aspectCss, resolveAspectRatio } from '../_shared/aspect';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { toShellStatus, type CanvasNodeData } from '../types';
import { genVideoSchema, type GenVideoData } from './schema';

export default function GenVideoNode({ id, selected, data }: NodeProps) {
  const d = data as GenVideoData & CanvasNodeData & { width?: number; ratio?: string };
  const status = d.status ?? 'idle';
  const assetId = d.output_asset_id ?? null;
  const ratio = resolveAspectRatio(d as Record<string, unknown>) ?? d.aspect_ratio;
  const aspect = aspectCss(ratio);

  return (
    <NodeShell
      width={typeof d.width === 'number' ? d.width : 300}
      title={d.title ?? genVideoSchema.title}
      icon={<NodeIcon type="gen_video" />}
      onTitleChange={(t) => renameNode(id, t)}
      meta={`${d.duration_sec}s · ${ratio}`}
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
      {assetId ? (
        <LazyVideoPlayer
          assetId={assetId}
          playerId={`node:${id}`}
          aspectRatio={aspect}
          objectFit="cover"
        />
      ) : (
        <div style={{ aspectRatio: aspect }}>
          {status === 'running' ? (
            <div
              className="w-full h-full flex items-center justify-center text-[11px]"
              style={{ color: 'var(--c-text-on-dark-3)' }}
            >
              渲染中…
            </div>
          ) : (
            <div className="node-ph" />
          )}
        </div>
      )}
    </NodeShell>
  );
}
