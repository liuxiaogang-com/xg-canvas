import { useEffect, useState } from 'react';

import { Drawer, Select, toast } from '../../ui';
import { assetApi, type AssetRecord } from '../../api/asset';
import { favoriteApi } from '../../api/favorite';
import StarIcon from '../../components/icons/StarIcon';
import { projectApi, type ProjectListItem } from '../../api/project';
import { useAssetUrl } from '../../hooks/useAssetUrl';

interface Props {
  asset: AssetRecord | null;
  onClose(): void;
  onAssetUpdated?(): void;
}

export default function AssetDetailDrawer({ asset, onClose, onAssetUpdated }: Props) {
  const url = useAssetUrl(asset?.id ?? null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [target, setTarget] = useState<string | undefined>();
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    if (!asset) return;
    projectApi
      .list()
      .then(setProjects)
      .catch(() => undefined);
    favoriteApi
      .list('asset')
      .then((r) => setFavorited(r.ids.includes(asset.id)))
      .catch(() => undefined);
  }, [asset]);

  const toggleFavorite = async () => {
    if (!asset) return;
    try {
      if (favorited) await favoriteApi.remove('asset', asset.id);
      else await favoriteApi.add('asset', asset.id);
      setFavorited(!favorited);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Drawer open={!!asset} onClose={onClose} title={asset?.name ?? asset?.id ?? ''} width={520}>
      {asset ? (
        <div className="space-y-4">
          <div className="rounded-md overflow-hidden bg-canvas-panel-2">
            {asset.type === 'image' && url ? <img src={url} className="w-full" alt="" /> : null}
            {asset.type === 'video' && url ? <video src={url} controls className="w-full" /> : null}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="btn btn--sm"
              onClick={toggleFavorite}
              aria-pressed={favorited}
            >
              <StarIcon filled={favorited} />
              {favorited ? '已收藏' : '收藏'}
            </button>
          </div>
          <dl className="text-xs text-text-3 grid grid-cols-2 gap-2">
            <dt>类型</dt>
            <dd className="text-text-2">{asset.type}</dd>
            <dt>归属</dt>
            <dd className="text-text-2">
              {asset.scope === 'project' ? '项目内' : '全局(workspace)'}
            </dd>
            <dt>尺寸</dt>
            <dd className="text-text-2">
              {asset.width ?? '-'}×{asset.height ?? '-'}
            </dd>
            <dt>大小</dt>
            <dd className="text-text-2">{(asset.bytes / 1024).toFixed(1)} KB</dd>
            <dt>创建</dt>
            <dd className="text-text-2">{asset.created_at}</dd>
          </dl>
          <div className="border-t border-canvas-border-soft pt-4">
            <div className="text-sm mb-2">保存到项目</div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select<string>
                  value={target}
                  onChange={(v) => setTarget(v)}
                  options={projects
                    .filter((p) => p.id !== asset.project_id)
                    .map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="选择项目"
                />
              </div>
              <button
                type="button"
                className="btn btn--primary gradient-btn !border-0"
                disabled={!target}
                onClick={async () => {
                  if (!target || !asset) return;
                  try {
                    await assetApi.copyToProject(asset.id, target);
                    toast.success('已保存到项目');
                    onAssetUpdated?.();
                    onClose();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
