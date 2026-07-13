import { useState } from 'react';

import { Select, toast } from '../../ui';
import { canvasApi } from '../../api/canvas';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { useNodeRunner } from '../hooks/useNodeRunner';
import { notifySyncError } from '../sync/sync-error';
import { useStoryboardRows, type StoryboardRow } from './useStoryboardRows';

interface Props {
  projectId: string;
}

export default function StoryboardTableView({ projectId }: Props) {
  const rows = useStoryboardRows();
  const [selected, setSelected] = useState<string[]>([]);
  const runner = useNodeRunner();

  const toggleAll = (checked: boolean) => setSelected(checked ? rows.map((r) => r.id) : []);
  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg text-text-1">分镜表格 · 共 {rows.length} 镜</h2>
        <button
          type="button"
          className="btn btn--primary gradient-btn !border-0"
          disabled={selected.length === 0}
          onClick={async () => {
            const results = await Promise.allSettled(
              selected.map((id) => runner.submit(id, projectId)),
            );
            const failed = results.filter((r) => r.status === 'rejected').length;
            if (failed) toast.error(`${failed}/${selected.length} 镜提交失败`);
            else toast.success(`已批量重生成 ${selected.length} 镜`);
            setSelected([]);
          }}
        >
          批量重生成({selected.length})
        </button>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                checked={selected.length > 0 && selected.length === rows.length}
                onChange={(e) => toggleAll(e.target.checked)}
              />
            </th>
            <th style={{ width: 60 }}>镜号</th>
            <th style={{ width: 220 }}>角色 / 场景 / 物品</th>
            <th>台词</th>
            <th>提示词</th>
            <th style={{ width: 90 }}>时长</th>
            <th style={{ width: 120 }}>生成</th>
            <th style={{ width: 100 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(e) => toggleOne(r.id, e.target.checked)}
                />
              </td>
              <td>{r.shot_no}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {r.characters.map((c) => (
                    <span key={`c-${c}`} className="tag tag--info">
                      {c}
                    </span>
                  ))}
                  {r.scene ? <span className="tag tag--accent">{r.scene}</span> : null}
                  {r.props.map((p) => (
                    <span key={`p-${p}`} className="tag tag--warning">
                      {p}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <textarea
                  className="textarea"
                  rows={1}
                  defaultValue={r.dialogue}
                  onBlur={(e) =>
                    canvasApi
                      .updateNode(projectId, r.id, { data: { dialogue: e.target.value } })
                      .catch((err) => notifySyncError(err, 'storyboard dialogue'))
                  }
                />
              </td>
              <td>
                <textarea
                  className="textarea"
                  rows={1}
                  defaultValue={r.prompt}
                  onBlur={(e) =>
                    canvasApi
                      .updateNode(projectId, r.id, { data: { prompt: e.target.value } })
                      .catch((err) => notifySyncError(err, 'storyboard prompt'))
                  }
                />
              </td>
              <td>
                <Select<number>
                  value={r.duration_sec}
                  onChange={(nv) =>
                    canvasApi
                      .updateNode(projectId, r.id, { data: { duration_sec: nv } })
                      .catch((err) => notifySyncError(err, 'storyboard duration'))
                  }
                  options={[3, 5, 8, 10, 15].map((d) => ({ value: d, label: `${d}s` }))}
                />
              </td>
              <td>
                <OutputCell row={r} />
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => runner.submit(r.id, projectId)}
                >
                  重新生成
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutputCell({ row }: { row: StoryboardRow }) {
  const url = useAssetUrl(row.output_asset_id, 3600, row.target === 'video' ? 'thumb' : 'full');
  if (!url) return <span className="text-text-3 text-xs">{row.status}</span>;
  return <img src={url} className="w-24 h-14 object-cover rounded" alt="" />;
}
