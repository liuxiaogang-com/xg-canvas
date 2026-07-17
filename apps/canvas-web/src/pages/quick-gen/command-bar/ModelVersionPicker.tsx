import { useEffect, useRef, useState } from 'react';

import type { ParamSpec } from '../../../api/model';
import { defaultParamValue, displayModelVersion } from '../../../generation/input-contract-ui';

interface Props {
  spec: ParamSpec | null;
  value: unknown;
  sourceLabel?: string;
  onChange(value: unknown): void;
}

const Caret = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export default function ModelVersionPicker({ spec, value, sourceLabel, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!spec) return null;

  const current = value ?? defaultParamValue(spec);
  const options = spec.options ?? [];

  return (
    <div className="qg-ctl-wrap" ref={ref}>
      <button type="button" className="qg-ctl qg-ctl--primary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="qg-ctl__val">{displayModelVersion(spec, current)}</span>
        <span className="qg-ctl__caret">{Caret}</span>
      </button>
      {open ? (
        <div className="qg-pop qg-pop--version">
          <div className="qg-pop__label">模型</div>
          <div className="qg-pop__list">
            {options.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                className={`qg-pop__opt${String(option.value) === String(current) ? ' qg-pop__opt--active' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="qg-versionopt">
                  {sourceLabel ? <span className="qg-versionopt__source">{sourceLabel}</span> : null}
                  <span className="qg-versionopt__name">{displayModelVersion(spec, option.value)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
