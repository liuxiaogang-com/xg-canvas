import { useCallback, useMemo, useState } from 'react';

import type { TaskRecord } from '../../api/task';
import { createClientId } from '../../lib/id';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

const LKEY = 'xgcanvas-conversations';
const TKEY = 'xgcanvas-conv-tasks'; // taskId -> conversationId

const DEFAULT: Conversation = { id: 'default', title: '默认创作', created_at: '' };

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
/**
 * Client-side conversation threads for the quick-gen feed (no backend model yet).
 * New tasks get tagged to the active conversation; the feed filters by it.
 * Untagged/seeded tasks live in 默认创作.
 */
export function useConversations() {
  const [list, setList] = useState<Conversation[]>(() => {
    const saved = load<Conversation[]>(LKEY, []);
    return saved.length ? saved : [DEFAULT];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = load<Conversation[]>(LKEY, [DEFAULT]);
    return saved[0]?.id ?? 'default';
  });
  const [taskMap, setTaskMap] = useState<Record<string, string>>(() => load(TKEY, {}));

  const create = useCallback(() => {
    const conv: Conversation = { id: createClientId(), title: '新对话', created_at: new Date().toISOString() };
    setList((prev) => {
      const next = [conv, ...prev.filter((c) => c.id !== 'default')];
      if (!next.some((c) => c.id === 'default')) next.push(DEFAULT);
      save(LKEY, next);
      return next;
    });
    setActiveId(conv.id);
    return conv.id;
  }, []);

  const remove = useCallback((id: string) => {
    if (id === 'default') return;
    setList((prev) => {
      const next = prev.filter((c) => c.id !== id);
      const fin = next.length ? next : [DEFAULT];
      save(LKEY, fin);
      return fin;
    });
    setActiveId((cur) => (cur === id ? 'default' : cur));
  }, []);

  const rename = useCallback((id: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setList((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, title: nextTitle } : c));
      save(LKEY, next);
      return next;
    });
  }, []);

  const tagTask = useCallback(
    (taskId: string, conversationId = activeId) => {
      setTaskMap((prev) => {
        const next = { ...prev, [taskId]: conversationId };
        save(TKEY, next);
        return next;
      });
    },
    [activeId],
  );

  const filterTasks = useCallback(
    (tasks: TaskRecord[]) =>
      tasks.filter((t) => {
        const conv = taskMap[t.id];
        return activeId === 'default' ? !conv || conv === 'default' : conv === activeId;
      }),
    [taskMap, activeId],
  );

  return useMemo(
    () => ({ list, activeId, setActiveId, create, remove, rename, tagTask, filterTasks }),
    [list, activeId, create, remove, rename, tagTask, filterTasks],
  );
}
