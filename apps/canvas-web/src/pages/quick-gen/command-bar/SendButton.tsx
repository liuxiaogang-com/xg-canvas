interface Props {
  loading?: boolean;
  disabled?: boolean;
  onClick(): void;
}

export default function SendButton({ onClick, loading, disabled }: Props) {
  return (
    <button type="button" className="qg-send" onClick={onClick} disabled={disabled || loading} aria-label="生成" title="生成">
      {loading ? (
        <span className="spinner" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      )}
    </button>
  );
}
