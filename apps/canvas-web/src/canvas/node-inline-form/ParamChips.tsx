import { useEffect, useRef, useState } from 'react';

import type { ParamSpec } from '../../api/model';

interface Props {
  specs: ParamSpec[];
  values: Record<string, unknown>;
  onChange(field: string, value: unknown): void;
}

const Caret = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

function optionLabel(spec: ParamSpec, value: unknown): string {
  const opt = spec.options?.find((o) => String(o.value) === String(value));
  return opt ? String(opt.label) : String(value);
}

function valueLabel(spec: ParamSpec, value: unknown): string | null {
  const actual = value ?? spec.default;
  if (actual === undefined || actual === null || actual === '') return null;
  if (spec.options?.length) return optionLabel(spec, actual);
  if (spec.control === 'toggle') return actual ? '开启' : '关闭';

  const raw = String(actual);
  if (/duration|time|seconds?|sec/i.test(spec.field)) return `${raw}s`;
  return raw;
}

/** Compact param control (model-schema driven): a pill that opens a wider
 * upward popover of selectable chips, refined for the inline form. */
export default function ParamChips({ specs, values, onChange }: Props) {
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

  const visible = specs.filter((s) => !s.advanced);
  if (visible.length === 0) return null;

  const summary = visible.map((s) => valueLabel(s, values[s.field])).filter(Boolean).join(' · ') || '参数';

  return (
    <div className="nifp" ref={ref}>
      <button
        type="button"
        className="nifp__pill"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="nifp__val">{summary}</span>
        <span className="nifp__caret">{Caret}</span>
      </button>
      {open ? (
        <div className="nifp__pop" onPointerDown={(e) => e.stopPropagation()}>
          {visible.map((s) => (
            <div key={s.field} className="nifp__group">
              <div className="nifp__label">{s.label}</div>
              {s.options?.length ? (
                <div className="nifp__chips">
                  {s.options.map((o) => (
                    <button
                      key={String(o.value)}
                      type="button"
                      className={`nifp__chip${String(values[s.field]) === String(o.value) ? ' nifp__chip--active' : ''}`}
                      onClick={() => onChange(s.field, o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="number"
                  className="nifp__num"
                  value={values[s.field] != null ? Number(values[s.field]) : ''}
                  min={s.min}
                  max={s.max}
                  step={s.step ?? 1}
                  onChange={(e) => onChange(s.field, e.target.value === '' ? undefined : Number(e.target.value))}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
