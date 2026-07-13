import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { assetApi, type AssetRecord } from '../../api/asset';
import AssetGrid from './AssetGrid';
import AssetDetailDrawer from './AssetDetailDrawer';

export default function AssetProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<AssetRecord[]>([]);
  const [selected, setSelected] = useState<AssetRecord | null>(null);

  const reload = async () => {
    if (!id) return;
    setRows(await assetApi.list({ project_id: id, limit: 120 }));
  };

  useEffect(() => {
    reload();
  }, [id]);

  return (
    <div>
      <AssetGrid assets={rows} onSelect={setSelected} />
      <AssetDetailDrawer asset={selected} onClose={() => setSelected(null)} onAssetUpdated={reload} />
    </div>
  );
}
