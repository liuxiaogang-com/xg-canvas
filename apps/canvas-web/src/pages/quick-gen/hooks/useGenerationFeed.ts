import { useCallback, useEffect, useMemo, useState } from 'react';

import { taskApi, type TaskRecord } from '../../../api/task';

const POLL_MS = 2500;
const TERMINAL: TaskRecord['status'][] = ['succeeded', 'failed', 'cancelled'];

export function useGenerationFeed() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const activeIds = useMemo(
    () => tasks.filter((task) => !TERMINAL.includes(task.status)).map((task) => task.id),
    [tasks],
  );
  const activeKey = activeIds.join(',');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await taskApi.list({ standalone: true, limit: 80 });
      setTasks((prev) => mergeTaskList(list, activeTasksMissingFrom(list, prev)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (activeIds.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const settled = await Promise.allSettled(activeIds.map((id) => taskApi.detail(id)));
      if (cancelled) return;
      const updates = settled
        .filter((result): result is PromiseFulfilledResult<TaskRecord> => result.status === 'fulfilled')
        .map((result) => result.value)
        .filter((task) => !task.project_id);
      if (updates.length > 0) setTasks((prev) => mergeTaskList(updates, prev));
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // activeKey changes only when membership changes; progress updates do not
    // tear down the recursive poller, so one transient all-failure cannot stop it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const submit = useCallback(async (body: Parameters<typeof taskApi.create>[0]) => {
    const created = await taskApi.create(body);
    setTasks((prev) => mergeTaskList([created], prev));
    return created;
  }, []);

  const replace = useCallback((task: TaskRecord) => {
    setTasks((prev) => mergeTaskList([task], prev));
  }, []);

  return useMemo(() => ({ tasks, loading, submit, reload, replace }), [tasks, loading, submit, reload, replace]);
}

function activeTasksMissingFrom(list: TaskRecord[], prev: TaskRecord[]): TaskRecord[] {
  const ids = new Set(list.map((task) => task.id));
  return prev.filter((task) => !ids.has(task.id) && !task.project_id && !TERMINAL.includes(task.status));
}

function mergeTaskList(primary: TaskRecord[], existing: TaskRecord[]): TaskRecord[] {
  const byId = new Map<string, TaskRecord>();
  for (const task of existing) if (!task.project_id) byId.set(task.id, task);
  for (const task of primary) {
    if (task.project_id) continue;
    const previous = byId.get(task.id);
    if (!previous || shouldReplace(previous, task)) byId.set(task.id, task);
  }
  return Array.from(byId.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function shouldReplace(previous: TaskRecord, candidate: TaskRecord): boolean {
  const previousTime = Date.parse(previous.updated_at);
  const candidateTime = Date.parse(candidate.updated_at);
  if (Number.isFinite(previousTime) && Number.isFinite(candidateTime) && candidateTime !== previousTime) {
    return candidateTime > previousTime;
  }
  return !(TERMINAL.includes(previous.status) && !TERMINAL.includes(candidate.status));
}
