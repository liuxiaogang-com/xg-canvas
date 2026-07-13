import { useEffect, useRef, useState } from 'react';

import type { ParamSpec } from '../../../api/model';

interface Props {
  specs: ParamSpec[];
  params: Record<string, unknown>;
  onChange(key: string, value: unknown): void;
}

const Caret = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

function ChipGroup({ label, options, value, onPick }: {
  label: string;
  options: { value: string | number; label: string }[];
  value: string | number;
  onPick(v: string | number): void;
}) {
  return (
    <div>
      <div className="qg-pop__label">{label}</div>
      <div className="qg-pop__chips">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={`qg-chip${String(value) === String(o.value) ? ' qg-chip--active' : ''}`}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SliderGroup({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
}) {
  return (
    <div>
      <div className="qg-pop__label">{label} · {value}</div>
      <div className="qg-pop__slider">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

function paramValueLabel(spec: ParamSpec, value: unknown): string | null {
  const actual = value ?? spec.default;
  if (actual === undefined || actual === null || actual === '') return null;
  if (spec.options?.length) {
    const opt = spec.options.find((o) => String(o.value) === String(actual));
    return opt ? opt.label : String(actual);
  }
  if (spec.control === 'toggle') return actual ? '开启' : '关闭';
  const raw = String(actual);
  if (/duration|time|seconds?|sec/i.test(spec.field)) return `${raw}s`;
  return raw;
}

/** Data-driven param popover. */
export default function ParamPopover({ specs, params, onChange }: Props) {
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

  if (specs.length === 0) return null;

  const label = specs.map((s) => paramValueLabel(s, params[s.field])).filter(Boolean).join(' · ');

  return (
    <div className="qg-ctl-wrap" ref={ref}>
      <button type="button" className="qg-ctl" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="qg-ctl__val">{label || '参数'}</span>
        <span className="qg-ctl__caret">{Caret}</span>
      </button>
      {open ? (
        <div className="qg-pop">
          {specs.map((s) => {
            const value = params[s.field] ?? s.default;

            if (s.control === 'chips' || s.control === 'select') {
              const options = s.options ?? [];
              if (options.length === 0) return null;
              return (
                <ChipGroup
                  key={s.field}
                  label={s.label}
                  options={options}
                  value={value as string | number}
                  onPick={(v) => onChange(s.field, v)}
                />
              );
            }

            if (s.control === 'slider') {
              const v = Number(value ?? 0);
              return (
                <SliderGroup
                  key={s.field}
                  label={s.label}
                  value={v}
                  min={s.min ?? 0}
                  max={s.max ?? 100}
                  step={s.step ?? 1}
                  onChange={(n) => onChange(s.field, n)}
                />
              );
            }

            if (s.control === 'number') {
              return (
                <div key={s.field}>
                  <div className="qg-pop__label">{s.label}</div>
                  <div className="qg-pop__row">
                    <input
                      type="number"
                      className="qg-num"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={value as number ?? ''}
                      onChange={(e) => onChange(s.field, e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  </div>
                </div>
              );
            }

            if (s.control === 'toggle') {
              return (
                <div key={s.field} className="qg-pop__row">
                  <label className="qg-pop__label" style={{ margin: 0 }}>{s.label}</label>
                  <button
                    type="button"
                    className={`qg-chip${value ? ' qg-chip--active' : ''}`}
                    onClick={() => onChange(s.field, !value)}
                  >
                    {value ? '开启' : '关闭'}
                  </button>
                </div>
              );
            }

            return null;
          })}
        </div>
      ) : null}
    </div>
  );
}
