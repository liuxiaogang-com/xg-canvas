import type { ChatTurn } from './types';

interface Props {
  turn: ChatTurn;
  onApply?(): void;
}

export default function AssistantMessage({ turn, onApply }: Props) {
  const explanation = turn.patch?.explanation ?? turn.content;
  const patchData = turn.patch?.patch?.data;
  return (
    <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--c-canvas-card)' }}>
      <p className="text-text-1 m-0 mb-2 whitespace-pre-wrap">{explanation}</p>
      {patchData ? (
        <pre className="text-[11px] bg-canvas-panel-2 rounded p-2 overflow-auto max-h-[120px] m-0 mb-2">
          {JSON.stringify(patchData, null, 2)}
        </pre>
      ) : null}
      {turn.patch?.create_node ? (
        <p className="text-[11px] text-text-3 m-0 mb-2">
          建议新建节点: <span className="text-text-2">{turn.patch.create_node.type}</span>
        </p>
      ) : null}
      {(patchData || turn.patch?.create_node) && onApply ? (
        <button type="button" className="btn btn--primary btn--sm gradient-btn !border-0" onClick={onApply}>
          应用
        </button>
      ) : null}
    </div>
  );
}
