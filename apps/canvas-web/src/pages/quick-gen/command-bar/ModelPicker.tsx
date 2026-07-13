import { useEffect, useRef, useState } from 'react';

import { modelApi, type ModelSummary } from '../../../api/model';
import { preferredModelId } from '../../../generation/input-contract-ui';
import { TASK_TYPE_BY_MODE, type GenMode } from '../types';

interface Props {
  mode: GenMode;
  value: string | null;
  onChange(v: string | null): void;
}

const Cube = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
  </svg>
);
const Caret = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export default function ModelPicker({ mode, value, onChange }: Props) {
  const [options, setOptions] = useState<ModelSummary[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    modelApi
      .list(TASK_TYPE_BY_MODE[mode])
      .then((rows) => {
        if (cancelled) return;
        setOptions(rows);
        if (!value && rows.length > 0) onChange(preferredModelId(rows));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const selected = options.find((option) => option.id === value);
  const label = selected?.display_name ?? (value ? value.split('/').pop() ?? value : '选择生成类型');

  return (
    <div className="qg-ctl-wrap" ref={ref}>
      <button type="button" className="qg-ctl" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {Cube}
        <span className="qg-ctl__val">{label}</span>
        <span className="qg-ctl__caret">{Caret}</span>
      </button>
      {open ? (
        <div className="qg-pop qg-pop--model">
          <div className="qg-pop__list">
            {options.length === 0 ? <div className="qg-pop__opt">暂无可用生成类型</div> : null}
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`qg-pop__opt${o.id === value ? ' qg-pop__opt--active' : ''}`}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span className="qg-modelopt__name">{o.display_name || o.id}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
