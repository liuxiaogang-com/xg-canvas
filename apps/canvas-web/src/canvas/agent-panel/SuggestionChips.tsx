interface Props {
  suggestions: string[];
  onPick(s: string): void;
}

export default function SuggestionChips({ suggestions, onPick }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex gap-2 px-3 pb-2 flex-wrap">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="chip hover:!bg-canvas-panel-2 text-text-2"
          style={{ fontSize: 11 }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
