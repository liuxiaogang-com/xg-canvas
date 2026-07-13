import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import NodePorts from '../_shared/NodePorts';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { toShellStatus, type CanvasNodeData } from '../types';
import { type StoryboardShotData } from './schema';

export default function StoryboardShotNode({ id, selected, data }: NodeProps) {
  const d = data as StoryboardShotData & CanvasNodeData;
  const status = d.status ?? 'idle';
  const url = useAssetUrl(d.output_asset_id ?? null, 3600, d.target === 'video' ? 'thumb' : 'full');
  return (
    <NodeShell
      width={300}
      title={d.title ?? `#${d.shot_no} ${d.summary?.slice(0, 16) ?? ''}`}
      icon={<NodeIcon type="storyboard_shot" />}
      onTitleChange={(t) => renameNode(id, t)}
      meta={`${d.duration_sec}s · ${d.target}`}
      status={toShellStatus(status)}
      selected={!!selected}
      ports={<NodePorts />}
    >
      <div>
        <div className="aspect-video">
          {url && d.target === 'image' ? (
            <img src={url} className="w-full h-full object-cover" alt="" />
          ) : null}
          {url && d.target === 'video' ? (
            <img src={url} className="w-full h-full object-cover" alt="" />
          ) : null}
          {!url ? <div className="node-ph" /> : null}
        </div>
        <div className="px-2 py-2 text-[11px]" style={{ color: 'var(--c-text-on-dark-2)' }}>
          {d.dialogue ? <div className="italic">「{d.dialogue}」</div> : null}
          <div className="line-clamp-2 mt-1" style={{ color: 'var(--c-text-on-dark-3)' }}>
            {d.prompt}
          </div>
        </div>
      </div>
    </NodeShell>
  );
}
