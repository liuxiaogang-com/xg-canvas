interface Props {
  value: string | undefined;
  onChange(v: string): void;
  placeholder?: string;
  multiline?: boolean;
  label?: string;
}

export function TextControl({ value, onChange, placeholder, multiline, label }: Props) {
  return (
    <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--c-text-on-dark-3)' }}>
      {label ? <span>{label}</span> : null}
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="bg-canvas-panel-2 rounded-md px-2 py-1 text-text-2 outline-none border border-canvas-border-soft focus:border-accent resize-y"
        />
      ) : (
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-canvas-panel-2 rounded-md px-2 py-1 text-text-2 outline-none border border-canvas-border-soft focus:border-accent"
        />
      )}
    </label>
  );
}
