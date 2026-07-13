import { useEffect, useState } from 'react';

import { Drawer, toast } from '../../ui';
import { canvasApi } from '../../api/canvas';

interface Props {
  projectId: string;
  open: boolean;
  onClose(): void;
  onRestored(): void;
}

interface Snap {
  id: string;
  version: number;
  created_at: string;
}

export default function HistoryDrawer({ projectId, open, onClose, onRestored }: Props) {
  const [items, setItems] = useState<Snap[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    canvasApi
      .listSnapshots(projectId)
      .then(setItems)
      .catch(() => toast.error('加载历史失败'))
      .finally(() => setLoaded(true));
  }, [open, projectId]);

  return (
    <Drawer open={open} onClose={onClose} title="画布历史" width={360}>
      <button
        type="button"
        className="btn btn--secondary"
        style={{ width: '100%', marginBottom: 12 }}
        onClick={async () => {
          try {
            await canvasApi.createSnapshot(projectId);
            setItems(await canvasApi.listSnapshots(projectId));
            toast.success('已创建快照');
          } catch (e) {
            toast.error((e as Error).message || '创建快照失败');
          }
        }}
      >
        创建快照
      </button>
      {!loaded ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="animate-pulse"
              style={{ height: 40, margin: '8px 0', borderRadius: 6, background: 'var(--c-canvas-card, rgba(255,255,255,0.05))' }}
            />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13, padding: '24px 0' }}>
          暂无快照
        </div>
      ) : (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((s) => (
          <li
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            <div>
              <div style={{ fontSize: 13 }}>{`v${s.version}`}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {new Date(s.created_at).toLocaleString('zh-CN')}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={async () => {
                try {
                  await canvasApi.restoreSnapshot(projectId, s.id);
                  toast.success('已还原');
                  onRestored();
                } catch (e) {
                  toast.error((e as Error).message || '还原失败');
                }
              }}
            >
              还原
            </button>
          </li>
        ))}
      </ul>
      )}
    </Drawer>
  );
}
