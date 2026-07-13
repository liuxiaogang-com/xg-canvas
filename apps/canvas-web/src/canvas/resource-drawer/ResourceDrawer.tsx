import { useEffect, useState } from 'react';

import { assetApi, type AssetRecord } from '../../api/asset';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { Drawer, Segmented } from '../../ui';

interface Props {
  projectId: string;
  open: boolean;
  onClose(): void;
}

type Filter = 'all' | AssetRecord['type'];
const FILTERS: { label: string; value: Filter }[] = [
  { label: '全部', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '音频', value: 'audio' },
  { label: '文本', value: 'text' },
];

/** 资源库 drawer (Ctrl+F): browse this project's generated assets with previews. */
export default function ResourceDrawer({ projectId, open, onClose }: Props) {
  const [assets, setAssets] = useState<AssetRecord[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!open) return;
    setAssets(null);
    assetApi
      .list({ project_id: projectId, limit: 100 })
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [open, projectId]);

  const visible = (assets ?? []).filter((a) => filter === 'all' || a.type === filter);

  return (
    <Drawer open={open} onClose={onClose} title="资源库" side="right" width={440}>
      <div className="flex flex-col h-full">
        <div className="mb-3">
          <Segmented<Filter> value={filter} onChange={setFilter} options={FILTERS} />
        </div>
        {assets === null ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded-lg bg-canvas-card border border-canvas-border-soft animate-pulse"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex-1 grid place-items-center text-text-3 text-[13px]">暂无资源</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 overflow-auto pr-0.5">
            {visible.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function AssetCard({ asset }: { asset: AssetRecord }) {
  const url = useAssetUrl(
    asset.type === 'image' || asset.type === 'video' ? asset.id : null,
    3600,
    asset.type === 'video' ? 'thumb' : 'full',
  );
  return (
    <div
      className="rounded-lg overflow-hidden bg-canvas-card border border-canvas-border-soft"
      title={asset.name ?? asset.id}
    >
      <div className="aspect-[4/3] grid place-items-center bg-canvas-panel-2">
        {asset.type === 'image' && url ? (
          <img src={url} alt={asset.name ?? ''} className="w-full h-full object-cover" />
        ) : asset.type === 'video' && url ? (
          <img src={url} alt={asset.name ?? ''} className="w-full h-full object-cover" />
        ) : (
          <TypeIcon type={asset.type} />
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="text-[11px] text-text-2 truncate">{asset.name ?? '未命名'}</div>
        <div className="text-[10px] text-text-3">{asset.type}</div>
      </div>
    </div>
  );
}

function TypeIcon({ type }: { type: AssetRecord['type'] }) {
  const path =
    type === 'audio'
      ? 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'
      : 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8';
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-3"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
