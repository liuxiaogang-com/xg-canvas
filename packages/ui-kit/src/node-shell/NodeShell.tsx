import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef, useState } from 'react';

import type { NodeStatus } from './StatusChip';

interface Props {
  title: ReactNode;
  status: NodeStatus;
  /** kept for API compatibility — status is shown as a small dot by the title. */
  statusLabel?: ReactNode;
  selected?: boolean;
  children: ReactNode;
  /** small muted text after the title (e.g. model id / ratio). */
  meta?: ReactNode;
  width?: number | string;
  /** connection handles slot (caller renders <Handle> from @xyflow/react). */
  ports?: ReactNode;
  /** small glyph shown before the title in the floating label. */
  icon?: ReactNode;
  /** type-color accent (output IO color) — a thin bar at the card top + label dot ring. */
  accent?: string;
  /** when provided, the title becomes double-click editable and this fires on commit. */
  onTitleChange?: (next: string) => void;
}

/** Status -> dot color (idle/queued/running/succeeded/failed). */
const DOT: Record<string, string> = {
  idle: '#64748b',
  queued: '#38bdf8',
  running: '#fbbf24',
  succeeded: '#22c55e',
  failed: '#ef4444',
  cancelled: '#64748b',
};

/**
 * v0.4.2 node shell — aligned to LibTV: the title is a muted label floating
 * ABOVE the card (with a small status dot), and the node itself is a flat,
 * hairline-bordered rounded card. Frame/port styling lives in
 * canvas-web/canvas/canvas-flow.css (.nodewrap / .nodecard / .node-port).
 * When `onTitleChange` is given, double-clicking the title opens an inline editor.
 */
export function NodeShell({ title, status, selected, children, meta, width, ports, icon, accent, onTitleChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const titleStr = typeof title === 'string' ? title : '';

  const startEdit = () => {
    if (!onTitleChange) return;
    setDraft(titleStr);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== titleStr) onTitleChange?.(next);
  };

  // Slide the side "+" connect buttons to follow the cursor's vertical position
  // along the card (TapNow/LibTV feel). Imperative CSS var — no re-render.
  const cardRef = useRef<HTMLDivElement>(null);
  const onCardPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(0.9, Math.max(0.1, (e.clientY - r.top) / r.height));
    el.style.setProperty('--port-y', `${(frac * 100).toFixed(1)}%`);
  };

  return (
    <div className="nodewrap" style={{ width }}>
      <div className="nodewrap__label">
        <span
          className={`nodewrap__dot${status === 'running' ? ' nodewrap__dot--pulse' : ''}`}
          style={{ background: DOT[status] ?? DOT.idle, boxShadow: accent ? `0 0 0 2px ${accent}55` : undefined }}
          aria-hidden
        />
        {icon ? <span className="nodewrap__icon">{icon}</span> : null}
        {editing ? (
          <input
            className="nodewrap__title-input nodrag"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="nodewrap__title"
            onDoubleClick={onTitleChange ? startEdit : undefined}
            title={onTitleChange ? '双击重命名' : undefined}
          >
            {title}
          </span>
        )}
        {meta ? <span className="nodewrap__meta">{meta}</span> : null}
      </div>
      <div ref={cardRef} className={`nodecard${selected ? ' nodecard--selected' : ''}`} onPointerMove={onCardPointerMove}>
        <span className="nodecard__accent" style={accent ? { background: accent } : undefined} aria-hidden />
        <div className="nodecard__media">{children}</div>
        {ports}
      </div>
    </div>
  );
}
