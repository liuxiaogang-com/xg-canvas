import { useEffect, useState } from 'react';

import { Drawer, Select, toast } from '../../ui';
import { entityApi, type EntityRecord } from '../../api/entity';
import { favoriteApi } from '../../api/favorite';
import StarIcon from '../../components/icons/StarIcon';
import { libraryApi, type LibraryEntryRecord } from '../../api/library';
import { projectApi, type ProjectListItem } from '../../api/project';
import { useAssetUrl } from '../../hooks/useAssetUrl';

interface Props {
  entry: LibraryEntryRecord | null;
  onClose(): void;
  onChanged(): void;
}

export default function LibraryEntryDrawer({ entry, onClose, onChanged }: Props) {
  const coverId = entry?.cover_asset_id ?? entry?.material?.asset_ids[0] ?? null;
  const coverUrl = useAssetUrl(coverId);
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    if (!entry) return;
    favoriteApi
      .list('library_entry')
      .then((r) => setFavorited(r.ids.includes(entry.id)))
      .catch(() => undefined);
  }, [entry]);

  if (!entry)
    return (
      <Drawer open={false} onClose={onClose} title="">
        {null}
      </Drawer>
    );

  const toggleFavorite = async () => {
    try {
      if (favorited) await favoriteApi.remove('library_entry', entry.id);
      else await favoriteApi.add('library_entry', entry.id);
      setFavorited(!favorited);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async () => {
    try {
      await libraryApi.remove(entry.id);
      toast.success('已删除');
      onChanged();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Drawer open onClose={onClose} title={entry.name} width={520}>
      <div className="space-y-4">
        {coverUrl ? (
          <div className="rounded-md overflow-hidden bg-canvas-panel-2">
            <img src={coverUrl} alt="" className="w-full" />
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <div className="text-xs text-text-3">
            {entry.visibility === 'private'
              ? '仅自己可见'
              : entry.visibility === 'project'
                ? '项目内可见'
                : '工作区可见'}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn--sm"
              onClick={toggleFavorite}
              aria-pressed={favorited}
            >
              <StarIcon filled={favorited} />
              {favorited ? '已收藏' : '收藏'}
            </button>
            <button type="button" className="btn btn--sm" onClick={remove}>
              删除
            </button>
          </div>
        </div>
        {entry.description ? (
          <p className="text-sm text-text-2 whitespace-pre-wrap">{entry.description}</p>
        ) : null}

        <section>
          <div className="text-sm mb-2">自有素材 ×{entry.material?.asset_ids.length ?? 0}</div>
          <div className="flex gap-2 flex-wrap">
            {(entry.material?.asset_ids ?? []).map((id) => (
              <MaterialThumb key={id} assetId={id} />
            ))}
            {(entry.material?.asset_ids.length ?? 0) === 0 ? (
              <div className="text-xs text-text-3">无自有素材</div>
            ) : null}
          </div>
        </section>

        <section className="border-t border-canvas-border-soft pt-4">
          <div className="text-sm mb-2">厂商绑定</div>
          {entry.provider_refs.length === 0 ? (
            <div className="text-xs text-text-3 mb-2">
              未登记厂商侧资源(如火山训练音色 ID、授权人像 ID)
            </div>
          ) : (
            <ul className="space-y-1 mb-2">
              {entry.provider_refs.map((p) => (
                <li
                  key={`${p.provider}:${p.external_ref_id}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="px-1.5 py-0.5 rounded bg-canvas-panel-2 text-text-2">
                    {p.provider}
                  </span>
                  <span className="text-text-2 truncate flex-1">{p.external_ref_id}</span>
                  <span className="text-text-3">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="text-xs text-text-3">
            厂商绑定功能尚未开放；未来仅由已验证的 Provider 凭证流程创建和更新。
          </div>
        </section>

        {entry.kind === 'character' ? <EntityLinkSection entry={entry} /> : null}
      </div>
    </Drawer>
  );
}

/** Link/unlink this character-library entry to narrative character entities
 *  (canvas.entities) of a chosen project — reference relation, not merge. */
function EntityLinkSection({ entry }: { entry: LibraryEntryRecord }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [entities, setEntities] = useState<EntityRecord[]>([]);

  useEffect(() => {
    projectApi
      .list()
      .then(setProjects)
      .catch(() => undefined);
  }, []);

  const loadEntities = (pid: string) => {
    entityApi
      .list(pid, 'character')
      .then(setEntities)
      .catch(() => setEntities([]));
  };

  const toggle = async (e: EntityRecord) => {
    const linked = e.library_entry_id === entry.id;
    try {
      await entityApi.update(e.id, { library_entry_id: linked ? null : entry.id });
      if (projectId) loadEntities(projectId);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <section className="border-t border-canvas-border-soft pt-4">
      <div className="text-sm mb-2">关联剧本角色</div>
      <Select<string>
        value={projectId}
        onChange={(v) => {
          setProjectId(v);
          if (v) loadEntities(v);
        }}
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        placeholder="选择项目"
      />
      {projectId ? (
        entities.length === 0 ? (
          <div className="text-xs text-text-3 mt-2">该项目暂无角色实体</div>
        ) : (
          <ul className="mt-2 space-y-1">
            {entities.map((e) => {
              const linked = e.library_entry_id === entry.id;
              const linkedElsewhere = !!e.library_entry_id && !linked;
              return (
                <li key={e.id} className="flex items-center gap-2 text-xs">
                  <span className="text-text-2 truncate flex-1">{e.name}</span>
                  {linkedElsewhere ? <span className="text-text-3">已关联其他条目</span> : null}
                  <button type="button" className="btn btn--sm" onClick={() => toggle(e)}>
                    {linked ? '解除关联' : '关联'}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </section>
  );
}

function MaterialThumb({ assetId }: { assetId: string }) {
  const url = useAssetUrl(assetId);
  return (
    <div className="w-16 h-16 rounded-md overflow-hidden bg-canvas-panel-2 border border-canvas-border-soft">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-text-3">
          audio
        </div>
      )}
    </div>
  );
}
