/* Shared building blocks for settings pages — thin wrappers over canvas-web's
 * native CSS primitives (.tbl/.btn/.field/.input/.tag) so every admin page is
 * visually consistent in the dark theme. */
import type { ReactNode } from 'react';

/* ── page scaffold ───────────────────────────────────────────── */
export function SettingsPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="set-page">
      <header className="set-page__head">
        <div>
          <h1 className="set-page__title">{title}</h1>
          {description ? <p className="set-page__desc">{description}</p> : null}
        </div>
        {actions ? <div className="set-page__actions">{actions}</div> : null}
      </header>
      <div className="set-page__body">{children}</div>
    </div>
  );
}

/* ── table ───────────────────────────────────────────────────── */
export interface Column<T> {
  key: string;
  header: string;
  width?: number | string;
  render?: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty = '暂无数据',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: string;
}) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={c.width ? { width: c.width } : undefined}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            {columns.map((c) => (
              <td key={c.key}>{c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── form field + inputs ─────────────────────────────────────── */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

/* ── badges ──────────────────────────────────────────────────── */
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'default';

export function Badge({ tone = 'default', children }: { tone?: Tone; children: ReactNode }) {
  const cls = tone === 'default' ? 'tag' : `tag tag--${tone}`;
  return <span className={cls}>{children}</span>;
}

export function BoolBadge({ value, on = '启用', off = '停用' }: { value: boolean; on?: string; off?: string }) {
  return <Badge tone={value ? 'success' : 'default'}>{value ? on : off}</Badge>;
}

/* ── stat card ───────────────────────────────────────────────── */
export function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="set-stat">
      <div className="set-stat__label">{label}</div>
      <div className="set-stat__value">{value}</div>
      {sub ? <div className="set-stat__sub">{sub}</div> : null}
    </div>
  );
}

/* ── async state helpers ─────────────────────────────────────── */
export function Loading({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="set-loading">
      <span className="spinner" /> {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="set-error">{message}</div>;
}
