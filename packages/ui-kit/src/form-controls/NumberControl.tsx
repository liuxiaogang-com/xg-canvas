interface Props {
  value: number | undefined;
  onChange(v: number): void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

export function NumberControl({ value, onChange, min, max, step, label }: Props) {
  return (
    <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--c-text-on-dark-3)' }}>
      {label ? <span>{label}</span> : null}
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="bg-canvas-panel-2 rounded-md px-2 py-1 text-text-2 outline-none border border-canvas-border-soft focus:border-accent w-[88px]"
      />
    </label>
  );
}
