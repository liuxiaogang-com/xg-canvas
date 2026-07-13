import { create } from 'zustand';

import { authzApi } from '../api/authz';

/**
 * Effective capabilities for the current user. systemCaps come from
 * /me/permissions; per-project caps (which already include system caps via the
 * server's union) are loaded lazily when entering a project. can() over these is
 * what gates UI down to the component level.
 */
interface PermState {
  systemCaps: Set<string>;
  isSuper: boolean;
  loaded: boolean;
  projectCaps: Record<string, Set<string>>;
  loadSystem(): Promise<void>;
  loadProject(pid: string): Promise<void>;
  reset(): void;
}

export const usePermStore = create<PermState>((set) => ({
  systemCaps: new Set(),
  isSuper: false,
  loaded: false,
  projectCaps: {},
  async loadSystem() {
    try {
      const r = await authzApi.mine();
      set({ systemCaps: new Set(r.caps), isSuper: r.is_super, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  async loadProject(pid) {
    try {
      const r = await authzApi.project(pid);
      set((s) => ({ projectCaps: { ...s.projectCaps, [pid]: new Set(r.caps) } }));
    } catch {
      /* ignore */
    }
  },
  reset() {
    set({ systemCaps: new Set(), isSuper: false, loaded: false, projectCaps: {} });
  },
}));

/** Returns a can(perm, projectId?) tester that re-renders on permission changes. */
export function useCan(): (perm: string, projectId?: string) => boolean {
  const systemCaps = usePermStore((s) => s.systemCaps);
  const projectCaps = usePermStore((s) => s.projectCaps);
  return (perm, projectId) =>
    projectId ? (projectCaps[projectId] ?? systemCaps).has(perm) : systemCaps.has(perm);
}

/** True if the user has any system-scope capability (gates the /settings area). */
export function useHasAnySystem(): boolean {
  return usePermStore((s) => s.systemCaps.size > 0 || s.isSuper);
}
