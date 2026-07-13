import { create } from 'zustand';

import type { GenMode } from '../pages/quick-gen/types';
import { readinessApi, type InstanceReadinessSnapshot, type ReadinessItemResult } from './api';
import { READINESS_BY_ID, READINESS_CATALOG, type ReadinessItemId, type ReadinessStatus } from './catalog';

interface ReadinessState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  items: ReadinessItemResult[];
  surfaces: InstanceReadinessSnapshot['surfaces'];
  /** Active quick-gen mode for surface gating (null outside /generate). */
  genMode: GenMode | null;
  setGenMode(mode: GenMode | null): void;
  load(): Promise<void>;
  invalidate(): Promise<void>;
  statusOf(id: ReadinessItemId): ReadinessStatus | undefined;
  incomplete(): Array<ReadinessItemResult & { title: string; hint: string; href: string }>;
}

export const useReadinessStore = create<ReadinessState>((set, get) => ({
  loaded: false,
  loading: false,
  error: null,
  items: [],
  surfaces: {},
  genMode: null,

  setGenMode(mode) {
    set({ genMode: mode });
  },

  async load() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const snap = await readinessApi.get();
      set({
        loaded: true,
        loading: false,
        items: snap.items,
        surfaces: snap.surfaces,
      });
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error: e instanceof Error ? e.message : '加载就绪状态失败',
      });
    }
  },

  async invalidate() {
    set({ loaded: false });
    await get().load();
  },

  statusOf(id) {
    return get().items.find((i) => i.id === id)?.status;
  },

  incomplete() {
    return get()
      .items
      .filter((i) => i.status !== 'ready' && i.status !== 'planned')
      .map((i) => {
        const meta = READINESS_BY_ID[i.id] ?? READINESS_CATALOG.find((c) => c.id === i.id);
        return {
          ...i,
          title: meta?.title ?? i.id,
          hint: meta?.hint ?? '',
          href: meta?.href ?? '/settings',
        };
      });
  },
}));
