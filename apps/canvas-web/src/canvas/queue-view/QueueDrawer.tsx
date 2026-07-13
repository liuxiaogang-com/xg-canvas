import { useEffect, useMemo, useState } from 'react';

import { Drawer, Segmented, toast } from '../../ui';
import { taskApi, type TaskRecord, type TaskStatus } from '../../api/task';

interface Props {
  projectId: string;
  open: boolean;
  onClose(): void;
}

const POLL_MS = 3000;
const STATUS_TAG: Record<TaskStatus, { cls: string; label: string }> = {
  pending: { cls: '', label: '排队中' },
  queued: { cls: 'tag--info', label: '排队中' },
  running: { cls: 'tag--info', label: '生成中' },
  succeeded: { cls: 'tag--success', label: '完成' },
  failed: { cls: 'tag--danger', label: '失败' },
  cancelled: { cls: '', label: '已取消' },
};

/** Task queue as a right-side drawer over the canvas — no page switch. */
export default function QueueDrawer({ projectId, open, onClose }: Props) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    try {
      setTasks(await taskApi.list({ project_id: projectId, limit: 200 }));
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    reload();
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const visible = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === 'pending' || t.status === 'queued' || t.status === 'running');
  }, [tasks, filter]);

  return (
    <Drawer open={open} onClose={onClose} title="任务队列" side="right" width={440}>
      <div className="flex flex-col h-full">
        <div className="flex justify-end mb-3">
          <Segmented<'active' | 'all'>
            value={filter}
            onChange={setFilter}
            options={[
              { label: '活跃', value: 'active' },
              { label: '全部', value: 'all' },
            ]}
          />
        </div>
        {!loaded ? (
          <ul className="flex-1 space-y-2 pr-0.5">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-[68px] rounded-lg bg-canvas-card border border-canvas-border-soft animate-pulse" />
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="flex-1 grid place-items-center text-text-3 text-[13px]">没有任务</div>
        ) : (
          <ul className="flex-1 overflow-auto space-y-2 pr-0.5">
            {visible.map((t) => (
              <li key={t.id} className="p-3 rounded-lg bg-canvas-card border border-canvas-border-soft">
                <div className="flex items-center gap-2">
                  <span className={`tag ${STATUS_TAG[t.status].cls}`} style={{ minWidth: 56, textAlign: 'center' }}>
                    {STATUS_TAG[t.status].label}
                  </span>
                  <span className="text-[11px] text-text-3">{t.type}</span>
                  <span className="ml-auto text-[10px] text-text-3">
                    {new Date(t.created_at).toLocaleTimeString('zh-CN')}
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-text-2 line-clamp-2">
                  {(t.inputs as { prompt?: string }).prompt || t.model_id || '—'}
                </div>
                {t.progress != null && t.status === 'running' ? (
                  <div className="progress mt-2">
                    <div className="progress__bar" style={{ width: `${Math.round(t.progress * 100)}%` }} />
                  </div>
                ) : null}
                {t.status === 'running' || t.status === 'queued' || t.status === 'pending' ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm mt-2"
                    onClick={async () => {
                      try {
                        await taskApi.cancel(t.id);
                        toast.success('已请求取消');
                        reload();
                      } catch (e) {
                        toast.error((e as Error).message || '取消失败');
                      }
                    }}
                  >
                    取消
                  </button>
                ) : null}
                {t.status === 'failed' ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm mt-2"
                    onClick={async () => {
                      try {
                        await taskApi.retry(t.id);
                        toast.success('已重新提交');
                        reload();
                      } catch (e) {
                        toast.error((e as Error).message || '重试失败');
                      }
                    }}
                  >
                    重试
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
