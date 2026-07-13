import { useState } from 'react';

interface Props {
  loading?: boolean;
  onSend(text: string): void;
}

export default function Composer({ loading, onSend }: Props) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };
  return (
    <div className="border-t border-canvas-border-soft p-3 flex items-end gap-2">
      <textarea
        className="textarea !bg-canvas-panel-2 !text-text-1"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={1}
        placeholder="说说你想怎么改…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        style={{ resize: 'none', minHeight: 32, maxHeight: 120 }}
      />
      <button
        type="button"
        disabled={loading}
        onClick={submit}
        className="btn btn--primary gradient-btn !border-0 rounded-full"
      >
        {loading && <span className="spinner" />}
        发送
      </button>
    </div>
  );
}
