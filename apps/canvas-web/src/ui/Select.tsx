import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SelectOption<V extends string | number = string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectProps<V extends string | number> {
  value: V | undefined;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Select<V extends string | number = string>({
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled,
  className,
  style,
}: SelectProps<V>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`select${className ? ' ' + className : ''}`} style={style} ref={ref}>
      <button
        type="button"
        className="select__trigger"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? '' : 'select__placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="select__caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="select__menu" role="listbox">
          {options.map((o) => (
            <div
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              className={`select__option${o.value === value ? ' select__option--selected' : ''}${
                o.disabled ? ' select__option--disabled' : ''
              }`}
              onClick={() => {
                if (o.disabled) return;
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
