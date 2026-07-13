import { useEffect, useRef, useState } from 'react';

import { Segmented, toast } from '../../ui';
import { assetApi, type AssetRecord } from '../../api/asset';
import { uploadAsset } from '../../lib/upload-asset';
import AssetGrid from './AssetGrid';
import AssetDetailDrawer from './AssetDetailDrawer';

type Filter = 'all' | 'image' | 'video' | 'audio' | 'text';
type View = 'workspace' | 'mine' | 'favorites' | 'uploads' | 'global';

export default function AssetGlobalPage() {
  const [rows, setRows] = useState<AssetRecord[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<View>('workspace');
  const [selected, setSelected] = useState<AssetRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const params: Parameters<typeof assetApi.list>[0] = { limit: 120 };
    if (filter !== 'all') params.type = filter as AssetRecord['type'];
    if (view === 'mine') params.owner = 'me';
    if (view === 'favorites') params.favorited = true;
    if (view === 'uploads') params.source = 'upload';
    if (view === 'global') params.project_id = 'global';
    setRows(await assetApi.list(params));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, view]);

  const handleUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAsset(file);
      toast.success('上传完成');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">资产库</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Segmented<Filter>
            options={[
              { label: '全部', value: 'all' },
              { label: '图片', value: 'image' },
              { label: '视频', value: 'video' },
              { label: '音频', value: 'audio' },
              { label: '文本', value: 'text' },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <button
            type="button"
            className="btn btn--primary gradient-btn !border-0"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? '上传中…' : '上传素材'}
          </button>
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </header>
      <div className="mb-6">
        <Segmented<View>
          options={[
            { label: '工作区', value: 'workspace' },
            { label: '我的', value: 'mine' },
            { label: '收藏', value: 'favorites' },
            { label: '我上传的', value: 'uploads' },
            { label: '全局资产', value: 'global' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      <AssetGrid assets={rows} onSelect={setSelected} />
      <AssetDetailDrawer asset={selected} onClose={() => setSelected(null)} onAssetUpdated={reload} />
    </div>
  );
}
