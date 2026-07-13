import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import ThemeSwitch from '../../components/ThemeSwitch';
import UserMenu from '../../components/UserMenu';
import './TopBar.css';

export type CanvasView = 'canvas' | 'list' | 'storyboard' | 'queue';

interface Props {
  projectName: string;
  view: CanvasView;
  onViewChange(v: CanvasView): void;
  onOpenQueue(): void;
  /** When set, double-click the name to rename (auto-saves on commit). */
  canRename?: boolean;
  onRename?(name: string): Promise<void> | void;
}

const VIEW_TABS: { label: string; value: CanvasView }[] = [
  { label: '画布', value: 'canvas' },
  { label: '列表', value: 'list' },
  { label: '分镜表', value: 'storyboard' },
];

export default function TopBar({
  projectName,
  view,
  onViewChange,
  onOpenQueue,
  canRename,
  onRename,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(projectName);
  }, [projectName, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const startEdit = () => {
    if (!canRename || !onRename || saving) return;
    setDraft(projectName);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(projectName);
    setEditing(false);
  };

  const commit = async () => {
    if (!onRename || saving) return;
    const next = draft.trim();
    if (!next || next === projectName) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      await onRename(next);
      setEditing(false);
    } catch {
      /* caller toasts; keep editing so user can retry / Esc */
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div className="cv-topbar">
      <div className="cv-topbar__left">
        <div className="cv-topbar__crumb">
          <Link to="/projects" className="cv-topbar__crumb-link">
            项目
          </Link>
          <span className="cv-topbar__crumb-sep">/</span>
          {editing ? (
            <input
              ref={inputRef}
              className="cv-topbar__crumb-input"
              value={draft}
              disabled={saving}
              maxLength={200}
              aria-label="项目名称"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={onKeyDown}
            />
          ) : (
            <span
              className={`cv-topbar__crumb-name${canRename ? ' cv-topbar__crumb-name--editable' : ''}`}
              title={canRename ? '双击重命名' : undefined}
              onDoubleClick={startEdit}
            >
              {projectName || '未命名项目'}
            </span>
          )}
        </div>
      </div>

      <div className="cv-topbar__center">
        <div className="cv-seg" role="tablist">
          {VIEW_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={view === t.value}
              className={`cv-seg__btn${view === t.value ? ' cv-seg__btn--active' : ''}`}
              onClick={() => onViewChange(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cv-topbar__right">
        <button type="button" className="cv-topbar__queue" onClick={onOpenQueue}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18M3 12h18M3 18h12" />
          </svg>
          队列
        </button>
        <ThemeSwitch />
        <UserMenu />
      </div>
    </div>
  );
}
