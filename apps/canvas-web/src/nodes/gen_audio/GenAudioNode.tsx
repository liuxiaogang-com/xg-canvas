import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import NodePorts from '../_shared/NodePorts';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { toShellStatus, type CanvasNodeData } from '../types';
import { genAudioSchema, type GenAudioData } from './schema';

export default function GenAudioNode({ id, selected, data }: NodeProps) {
  const d = data as GenAudioData & CanvasNodeData;
  const status = d.status ?? 'idle';
  const url = useAssetUrl(d.output_asset_id ?? null);
  return (
    <NodeShell
      width={260}
      title={d.title ?? genAudioSchema.title}
      icon={<NodeIcon type="gen_audio" />}
      onTitleChange={(t) => renameNode(id, t)}
      meta={`${d.variant} · ${d.duration_sec}s`}
      status={toShellStatus(status)}
      statusLabel={status === 'idle' ? '空闲' : status}
      selected={!!selected}
      ports={<NodePorts />}
    >
      <div className="p-3" style={{ minHeight: 56 }}>
        {url ? (
          <audio src={url} controls className="w-full" />
        ) : (
          <div className="text-[11px]" style={{ color: 'var(--c-text-on-dark-3)' }}>
            {status === 'running' ? '合成中…' : d.prompt || '未输入提示词'}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
