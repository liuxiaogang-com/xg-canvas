import { useEffect, useRef, useState } from 'react';

import type { ParamSpec } from '../../api/model';
import { defaultParamValue, displayModelVersion } from '../../generation/input-contract-ui';

interface Props {
  spec: ParamSpec | null;
  value: unknown;
  sourceLabel?: string;
  onChange(value: unknown): void;
}

const Caret = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

  if (!spec?.options?.length) return null;

  const current = value ?? defaultParamValue(spec);

  return (
    <div className="nif-model-version" ref={ref}>
      <button
        type="button"
        className="nif-select nif-select--primary"
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className="nif-select__value">{displayModelVersion(current)}</span>
        <span className="nif-select__caret">{Caret}</span>
      </button>

      {open ? (
        <div className="nif-model-version__menu" role="listbox" onPointerDown={(e) => e.stopPropagation()}>
          {spec.options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={String(option.value) === String(current)}
              className={`nif-model-version__option${String(option.value) === String(current) ? ' nif-model-version__option--selected' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {sourceLabel ? <span className="nif-model-version__source">{sourceLabel}</span> : null}
              <span className="nif-model-version__name">{displayModelVersion(option.value)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
