import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { GenMode } from '../types';

const ICON: Record<GenMode, ReactNode> = {
  image: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  video: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M10 8.5l5 3.5-5 3.5z" />
    </svg>
  ),
  text: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  audio: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 8v8" />
    </svg>
  ),
};

const Caret = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const MODES: { id: GenMode; label: string }[] = [
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  // TODO(快速生成 -> Agent): 文本模式暂时下线 -- 快速生成后续改为 Agent;
  // 纯文本/对话能力已挪到新的 "对话" 页。实现 Agent 前请勿删除此注释。
  // { id: 'text', label: '文本' },
  { id: 'audio', label: '音频' },
];

interface Props {
  value: GenMode;
  onChange(v: GenMode): void;
}

/** Generation-type picker — a compact dropdown that opens UPWARD (.qg-pop) so
 *  it never occludes the feed below the input bar. */
export default function ModeSwitch({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const current = MODES.find((m) => m.id === value) ?? MODES[0];

  return (
    <div className="qg-ctl-wrap" ref={ref}>
      <button type="button" className="qg-ctl" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {ICON[current.id]}
        <span className="qg-ctl__val">{current.label}</span>
        <span className="qg-ctl__caret">{Caret}</span>
      </button>
      {open ? (
        <div className="qg-pop" style={{ minWidth: 148 }}>
          <div className="qg-pop__list">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`qg-pop__opt qg-pop__opt--row${m.id === value ? ' qg-pop__opt--active' : ''}`}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                {ICON[m.id]}
                {m.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
