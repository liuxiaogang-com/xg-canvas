interface Props {
  label: string;
  icon?: string;
  onClick(): void;
  active?: boolean;
}

export default function ActionChip({ label, icon, onClick, active }: Props) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs transition border ${
        active
          ? 'bg-accent text-white border-accent'
          : 'bg-canvas-panel-2 text-text-2 border-canvas-border-soft hover:border-cyan'
      }`}
    >
      {icon ? <span className="mr-1">{icon}</span> : null}
      {label}
    </button>
  );
}
