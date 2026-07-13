import { useEffect, useState } from 'react';

import { taskApi, type TaskRecord } from '../api/task';

const TERMINAL: TaskRecord['status'][] = ['succeeded', 'failed', 'cancelled'];

/**
 * Generic task polling. Defaults to 2s; backs off automatically once the
 * task reaches a terminal state.
 */
export function useTaskPolling(taskId: string | null, intervalMs = 2000): TaskRecord | null {
  const [task, setTask] = useState<TaskRecord | null>(null);

  useEffect(() => {
    setTask(null);
    if (!taskId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryMs = intervalMs;
    const tick = async () => {
      try {
        const t = await taskApi.detail(taskId);
        if (cancelled) return;
        setTask(t);
        retryMs = intervalMs;
        if (!TERMINAL.includes(t.status)) {
          timer = setTimeout(tick, retryMs);
        }
      } catch {
        retryMs = Math.min(retryMs * 2, 30_000);
        if (!cancelled) timer = setTimeout(tick, retryMs);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId, intervalMs]);

  return task;
}
