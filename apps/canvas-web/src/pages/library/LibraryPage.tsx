import { useEffect, useState } from 'react';

import { Segmented } from '../../ui';
import { libraryApi, type LibraryEntryRecord } from '../../api/library';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import LibraryCreateModal from './LibraryCreateModal';
import LibraryEntryDrawer from './LibraryEntryDrawer';

type Kind = 'character' | 'voice' | 'style';
type View = 'all' | 'mine' | 'favorites';

const KIND_LABEL: Record<Kind, string> = { character: '人物库', voice: '音色库', style: '风格库' };

export default function LibraryPage() {
  const [kind, setKind] = useState<Kind>('character');
  const [view, setView] = useState<View>('all');
  const [rows, setRows] = useState<LibraryEntryRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<LibraryEntryRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    const params: Parameters<typeof libraryApi.list>[0] = { kind, limit: 120 };
    if (view === 'favorites') params.favorited = true;
    if (query.trim()) params.q = query.trim();
    let list = await libraryApi.list(params);
    // owner=me filtering is client-side for the library (list already only
    // returns entries the user may see).
    setRows(list);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, view, query]);

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">{KIND_LABEL[kind]}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Segmented<Kind>
            options={[
              { label: '人物', value: 'character' },
              { label: '音色', value: 'voice' },
              { label: '风格', value: 'style' },
            ]}
            value={kind}
            onChange={setKind}
          />
          <Segmented<View>
            options={[
              { label: '全部', value: 'all' },
              { label: '收藏', value: 'favorites' },
            ]}
            value={view}
            onChange={setView}
          />
          <input
            className="input w-48"
            placeholder="搜索名称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="btn btn--primary gradient-btn !border-0" onClick={() => setCreating(true)}>
            新建条目
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="text-text-3 text-sm py-16 text-center">
          暂无{KIND_LABEL[kind]}条目。可先登记自有素材（参考图/参考音频）。
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {rows.map((e) => (
            <EntryCard key={e.id} entry={e} onClick={() => setSelected(e)} />
          ))}
        </div>
      )}

      <LibraryCreateModal
        open={creating}
        kind={kind}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          reload();
        }}
      />
      <LibraryEntryDrawer entry={selected} onClose={() => setSelected(null)} onChanged={reload} />
    </div>
  );
}

function EntryCard({ entry, onClick }: { entry: LibraryEntryRecord; onClick(): void }) {
  const coverId = entry.cover_asset_id ?? entry.material?.asset_ids[0] ?? null;
  const url = useAssetUrl(coverId);
  return (
    <button
      onClick={onClick}
      className="group rounded-md overflow-hidden bg-canvas-card border border-canvas-border-soft hover:border-cyan transition text-left"
    >
      <div className="aspect-square bg-canvas-panel-2">
        {url ? (
          <img src={url} alt={entry.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-3 text-xs">
            {entry.kind === 'voice' ? '音色' : entry.kind === 'style' ? '风格' : '人物'}
          </div>
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="text-xs text-text-1 truncate">{entry.name}</div>
        <div className="text-[10px] text-text-3 truncate">
          {entry.provider_refs.length > 0 ? `厂商绑定 ×${entry.provider_refs.length}` : ''}
          {entry.provider_refs.length > 0 && (entry.material?.asset_ids.length ?? 0) > 0 ? ' · ' : ''}
          {(entry.material?.asset_ids.length ?? 0) > 0 ? `素材 ×${entry.material!.asset_ids.length}` : ''}
        </div>
      </div>
    </button>
  );
}
