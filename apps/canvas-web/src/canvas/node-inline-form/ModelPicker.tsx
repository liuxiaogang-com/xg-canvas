import { useEffect, useRef, useState } from 'react';

import type { RichModelSummary } from '../../api/model';

interface Props {
  models: RichModelSummary[];
  value: string | null;
  onChange(id: string): void;
}

const Caret = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** In-node generation-type picker. These entries are generation types, not
 * vendor model names, so the menu intentionally shows only the type label. */
export default function ModelPicker({ models, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.model_id === value);

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

  return (
    <div className="nif-model" ref={ref}>
      <button
        type="button"
        className="nif-select"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? 'nif-select__value' : 'nif-select__placeholder'}>
          {selected?.display_name ?? '选择生成类型'}
        </span>
        <span className="nif-select__caret">{Caret}</span>
      </button>

      {open ? (
        <div className="nif-model__menu" role="listbox" onPointerDown={(e) => e.stopPropagation()}>
          {models.length === 0 ? (
            <div className="nif-model__empty">
              暂无可用生成类型 · <a href="/settings/credentials?add=1">配置供应商凭证</a>
            </div>
          ) : null}
          {models.map((model) => (
            <button
              key={model.model_resource_uid}
              type="button"
              role="option"
              aria-selected={model.model_id === value}
              className={`nif-model__option${model.model_id === value ? ' nif-model__option--selected' : ''}`}
              onClick={() => {
                onChange(model.model_id);
                setOpen(false);
              }}
            >
              <span className="nif-model__name">{model.display_name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
