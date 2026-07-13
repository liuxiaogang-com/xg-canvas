interface Props {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onClick(): void;
}

/** Aurora-gradient generate button (icon is inline SVG, not an emoji). */
export default function SubmitButton({ label, disabled, busy, onClick }: Props) {
  return (
    <button type="button" className="nif-submit" disabled={disabled || busy} onClick={onClick}>
      <span>{busy ? '生成中…' : label}</span>
      {!busy ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      ) : null}
    </button>
  );
}
