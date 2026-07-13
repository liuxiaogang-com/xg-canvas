interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string | undefined;
  onChange(v: string): void;
  options: Option[];
  label?: string;
  disabled?: boolean;
}

export function EnumControl({ value, onChange, options, label, disabled }: Props) {
  return (
    <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--c-text-on-dark-3)' }}>
      {label ? <span>{label}</span> : null}
      <select
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="bg-canvas-panel-2 rounded-md px-2 py-1 text-text-2 outline-none border border-canvas-border-soft focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
