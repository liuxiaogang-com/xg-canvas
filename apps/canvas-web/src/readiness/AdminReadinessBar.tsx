import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useHasAnySystem } from '../store/permissions';
import { READINESS_BY_ID, READINESS_CATALOG } from './catalog';
import { useReadinessStore } from './store';
import './readiness.css';

/** Admin-only floating bar: incomplete readiness items with deep links. */
export default function AdminReadinessBar() {
  const hasSystem = useHasAnySystem();
  const load = useReadinessStore((s) => s.load);
  const loaded = useReadinessStore((s) => s.loaded);
  const items = useReadinessStore((s) => s.items);
  const [open, setOpen] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    if (hasSystem) void load();
  }, [hasSystem, load]);

  const incomplete = useMemo(
    () =>
      items
        .filter((i) => i.status !== 'ready' && i.status !== 'planned')
        .map((i) => {
          const meta = READINESS_BY_ID[i.id] ?? READINESS_CATALOG.find((c) => c.id === i.id);
          return {
            ...i,
            title: meta?.title ?? i.id,
            hint: meta?.hint ?? '',
            href: meta?.href ?? '/settings',
          };
        }),
    [items],
  );

  if (!hasSystem || !loaded || incomplete.length === 0) return null;

  return (
    <div className={`rdy-bar${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="rdy-bar__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        还需配置 {incomplete.length} 项
      </button>
      {open ? (
        <ul className="rdy-bar__list">
          {incomplete.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="rdy-bar__item"
                onClick={() => {
                  nav(item.href);
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.status === 'unverified' ? '已填写，待测试连通' : item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
