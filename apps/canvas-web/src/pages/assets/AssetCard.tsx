import { useAssetUrl } from '../../hooks/useAssetUrl';
import type { AssetRecord } from '../../api/asset';

interface Props {
  asset: AssetRecord;
  onClick?(): void;
}

export default function AssetCard({ asset, onClick }: Props) {
  const url = useAssetUrl(asset.id, 3600, asset.type === 'video' ? 'thumb' : 'full');
  return (
    <button
      onClick={onClick}
      className="group rounded-md overflow-hidden bg-canvas-card border border-canvas-border-soft hover:border-cyan transition text-left"
    >
      <div className="aspect-square bg-canvas-panel-2">
        {asset.type === 'image' && url ? (
          <img src={url} alt={asset.name ?? asset.id} className="w-full h-full object-cover" />
        ) : asset.type === 'video' && url ? (
          <img src={url} alt={asset.name ?? asset.id} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-3 text-xs">
            {asset.type}
          </div>
        )}
      </div>
      <div className="px-2 py-1 text-[11px] text-text-3 truncate">
        {asset.name ?? asset.role ?? asset.id.slice(0, 8)}
      </div>
    </button>
  );
}
