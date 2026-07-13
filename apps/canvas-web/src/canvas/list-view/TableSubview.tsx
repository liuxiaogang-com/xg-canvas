import { useCanvasStore } from '../canvas-state';
import type { CanvasNodeData } from '../../nodes/types';

interface Props {
  filter: string;
}

export default function TableSubview({ filter }: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const rows = (filter === 'all' ? nodes : nodes.filter((n) => n.type === filter)).map((n) => ({
    key: n.id,
    type: n.type,
    status: (n.data as CanvasNodeData).status ?? 'idle',
    prompt: (n.data as { prompt?: string }).prompt ?? '',
    model: (n.data as { model_id?: string }).model_id ?? '',
  }));
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th style={{ width: 120 }}>类型</th>
          <th style={{ width: 100 }}>状态</th>
          <th>提示词</th>
          <th style={{ width: 200 }}>模型</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            onClick={() => useCanvasStore.getState().setSelected(r.key as string)}
            style={{ cursor: 'pointer' }}
          >
            <td>{r.type}</td>
            <td>{r.status}</td>
            <td>{r.prompt}</td>
            <td>{r.model}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
