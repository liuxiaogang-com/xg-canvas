import AssistantMessage from './AssistantMessage';
import type { ChatTurn } from './types';

interface Props {
  turns: ChatTurn[];
  onApply(idx: number): void;
}

export default function MessageList({ turns, onApply }: Props) {
  return (
    <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
      {turns.length === 0 ? (
        <p className="text-text-3 text-xs">还没有对话。在下方输入诉求，例如「把光线调暗一点」。</p>
      ) : null}
      {turns.map((t, i) =>
        t.role === 'user' ? (
          <div key={i} className="rounded-lg p-3 text-sm bg-accent-soft text-text-1 max-w-[90%] ml-auto whitespace-pre-wrap">
            {t.content}
          </div>
        ) : (
          <AssistantMessage key={i} turn={t} onApply={() => onApply(i)} />
        ),
      )}
    </div>
  );
}
