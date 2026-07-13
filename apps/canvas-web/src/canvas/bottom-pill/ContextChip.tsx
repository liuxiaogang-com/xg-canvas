interface Props {
  title: string;
  subtitle?: string;
}

export default function ContextChip({ title, subtitle }: Props) {
  return (
    <div className="flex items-center gap-2 pr-3 border-r border-canvas-border-soft">
      <div className="w-7 h-7 rounded-full bg-gradient-aurora opacity-80" />
      <div className="leading-tight">
        <div className="text-xs text-text-1">{title}</div>
        {subtitle ? <div className="text-[10px] text-text-3">{subtitle}</div> : null}
      </div>
    </div>
  );
}
