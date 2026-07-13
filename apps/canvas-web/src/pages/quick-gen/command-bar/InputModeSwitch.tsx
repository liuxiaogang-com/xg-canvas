import { useEffect, useRef, useState } from 'react';

import type { GenerationModeOption } from '../../../generation/input-contract-ui';

interface Props {
  modes: GenerationModeOption[];
  value: string | null;
  onChange(v: string): void;
}

const Caret = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export default function InputModeSwitch({ modes, value, onChange }: Props) {
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

  if (modes.length === 0) return null;

  const current = modes.find((mode) => mode.id === value) ?? modes[0];

  return (
    <div className="qg-ctl-wrap" ref={ref}>
      <button type="button" className="qg-ctl" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={modes.length === 1}>
        <span className="qg-ctl__val">{current.label}</span>
        {modes.length > 1 ? <span className="qg-ctl__caret">{Caret}</span> : null}
      </button>
      {open && modes.length > 1 ? (
        <div className="qg-pop" style={{ minWidth: 168 }}>
          <div className="qg-pop__list">
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`qg-pop__opt${mode.id === current.id ? ' qg-pop__opt--active' : ''}`}
                onClick={() => {
                  onChange(mode.id);
                  setOpen(false);
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
