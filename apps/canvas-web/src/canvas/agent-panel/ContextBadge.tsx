interface Props {
  nodeId: string | null;
  nodeTitle: string | null;
  onClear?(): void;
}

export default function ContextBadge({ nodeId, nodeTitle, onClear }: Props) {
  if (!nodeId) {
    return (
      <div className="flex items-center justify-between text-xs text-text-3 px-3 py-2 border-b border-canvas-border-soft">
        <span>未选中节点 — 可直接让 Agent 创建新节点</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-xs px-3 py-2 border-b border-canvas-border-soft">
      <span className="text-text-2">
        作用于:<span className="text-cyan ml-1">{nodeTitle}</span>
      </span>
      {onClear ? (
        <button onClick={onClear} className="text-text-3 hover:text-text-1">
          解除
        </button>
      ) : null}
    </div>
  );
}
