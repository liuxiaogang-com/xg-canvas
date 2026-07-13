import type { ReactNode } from 'react';

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: ReactNode;
}

interface Props<V extends string> {
  value: V;
  options: SegmentedOption<V>[];
  onChange: (v: V) => void;
  className?: string;
}

export function Segmented<V extends string = string>({ value, options, onChange, className }: Props<V>) {
  return (
    <div className={`seg${className ? ' ' + className : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`seg__btn${value === o.value ? ' seg__btn--active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
