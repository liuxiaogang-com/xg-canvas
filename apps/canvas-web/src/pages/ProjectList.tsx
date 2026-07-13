import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { projectApi, type ProjectListItem } from '../api/project';
import StarIcon from '../components/icons/StarIcon';
import { useAuthStore } from '../store/auth';
import { Modal, toast } from '../ui';
import './ProjectList.css';

type Filter = 'all' | 'active' | 'favorite' | 'archived';
type ViewMode = 'grid' | 'list';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'favorite', label: '收藏' },
  { key: 'archived', label: '归档' },
];

export default function ProjectListPage() {
  const auth = useAuthStore();
  const [rows, setRows] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<ProjectListItem | null>(null);
  const [renameName, setRenameName] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('grid');

  const reload = async () => {
    setLoading(true);
    try {
      setRows(await projectApi.list());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const visible = rows.filter((p) => {
    if (filter === 'active' && p.archived) return false;
    if (filter === 'favorite' && !p.is_favorite) return false;
    if (filter === 'archived' && !p.archived) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const wsId = auth.me?.workspace_id;
      if (!wsId) throw new Error('未取到 workspace');
      await projectApi.create(wsId, name.trim());
      setCreating(false);
      setName('');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openRename = (project: ProjectListItem) => {
    setRenaming(project);
    setRenameName(project.name);
  };

  const handleRename = async () => {
    const nextName = renameName.trim();
    if (!renaming || !nextName) return;
    try {
      const updated = await projectApi.update(renaming.id, { name: nextName });
      setRows((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setRenaming(null);
      setRenameName('');
      toast.success('项目已重命名');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="proj-page">
      <header className="proj-page__header">
        <h1 className="proj-page__title">项目</h1>
        <span className="proj-page__count">{loading ? '…' : `${rows.length} 个`}</span>
        <span className="proj-page__header-spacer" />
        <div className="proj-page__search">
          <span aria-hidden>⌕</span>
          <input
            type="text"
            placeholder="搜索项目…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>
          + 新建项目
        </button>
      </header>

      <div className="proj-page__filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`proj-tab${filter === f.key ? ' proj-tab--active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <div className="proj-page__view-toggle" role="tablist">
          <button
            type="button"
            className={view === 'grid' ? 'active' : ''}
            onClick={() => setView('grid')}
          >
            ▦ 卡片
          </button>
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            ☰ 列表
          </button>
        </div>
      </div>

      <div className="proj-page__body">
        {loading ? (
          <div className="proj-page__empty">加载中…</div>
        ) : visible.length === 0 ? (
          <div className="proj-page__empty">
            {search ? '没有匹配项' : '还没有项目,先新建一个吧'}
          </div>
        ) : (
          <div className="proj-grid">
            {visible.map((p) => (
              <ProjectCard key={p.id} p={p} onRename={openRename} />
            ))}
            <button
              type="button"
              className="proj-card proj-card--new"
              onClick={() => setCreating(true)}
            >
              <span className="proj-card--new__plus">+</span>
              新建项目
            </button>
          </div>
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="新建项目"
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setCreating(false)}>
              取消
            </button>
            <button className="btn btn--primary" onClick={handleCreate} disabled={!name.trim()}>
              创建
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field__label" htmlFor="proj-name">
            项目名称
          </label>
          <input
            id="proj-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: 短片预告 v1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="重命名项目"
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setRenaming(null)}>
              取消
            </button>
            <button
              className="btn btn--primary"
              onClick={handleRename}
              disabled={!renameName.trim()}
            >
              保存
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field__label" htmlFor="project-rename-name">
            项目名称
          </label>
          <input
            id="project-rename-name"
            className="input"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="输入新的项目名称"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
            }}
          />
        </div>
      </Modal>
    </div>
  );
}

function ProjectCard({
  p,
  onRename,
}: {
  p: ProjectListItem;
  onRename(project: ProjectListItem): void;
}) {
  const nav = useNavigate();
  return (
    <Link to={`/projects/${p.id}`} className="proj-card">
      <div className="proj-card__cover">
        {p.cover_url ? <img src={p.cover_url} alt={p.name} /> : null}
        <span className={`proj-card__fav${p.is_favorite ? ' proj-card__fav--on' : ''}`}>
          <StarIcon filled={p.is_favorite} size={15} />
        </span>
      </div>
      <div className="proj-card__body">
        <div className="proj-card__name">{p.name}</div>
        {p.description ? <div className="proj-card__desc">{p.description}</div> : null}
        <div className="proj-card__meta">
          <span>{p.asset_count} 资产</span>
          <span className="proj-card__meta-dot" />
          <span>{p.node_count} 节点</span>
          {!p.archived && <span className="proj-card__status">进行中</span>}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRename(p);
            }}
          >
            重命名
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              nav(`/projects/${p.id}/members`);
            }}
          >
            成员
          </button>
        </div>
      </div>
    </Link>
  );
}
