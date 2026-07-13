import type { Node } from '@xyflow/react';

import { useAssetUrl } from '../../hooks/useAssetUrl';
import { getSchema } from '../../nodes/registry';
import type { CanvasNodeData } from '../../nodes/types';
import { useCanvasStore } from '../canvas-state';

interface Props {
  filter: string;
}

export default function GridSubview({ filter }: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const visible = filter === 'all' ? nodes : nodes.filter((n) => n.type === filter);
  if (visible.length === 0) return <p className="text-text-3">画布上还没有节点</p>;
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {visible.map((n) => (
        <Card key={n.id} node={n} />
      ))}
    </div>
  );
}

function Card({ node }: { node: Node<CanvasNodeData> }) {
  const schema = getSchema(node.type ?? '');
  const url = useAssetUrl(
    node.data.output_asset_id ?? null,
    3600,
    node.type === 'gen_video' ? 'thumb' : 'full',
  );
  const status = node.data.status ?? 'idle';
  return (
    <button
      onClick={() => useCanvasStore.getState().setSelected(node.id)}
      className="rounded-lg overflow-hidden bg-canvas-card border border-canvas-border-soft hover:border-cyan text-left"
    >
      <div className="aspect-video bg-canvas-panel-2">
        {url && node.type === 'gen_image' ? (
          <img src={url} className="w-full h-full object-cover" alt="" />
        ) : null}
        {url && node.type === 'gen_video' ? (
          <img src={url} className="w-full h-full object-cover" alt="" />
        ) : null}
        {!url ? <div className="node-ph" /> : null}
      </div>
      <div className="px-3 py-2">
        <div className="text-xs text-text-1">{schema?.title ?? node.type}</div>
        <div className="text-[10px] text-text-3 mt-0.5">
          {status} · {(node.data as { prompt?: string }).prompt?.slice(0, 24) ?? ''}
        </div>
      </div>
    </button>
  );
}
