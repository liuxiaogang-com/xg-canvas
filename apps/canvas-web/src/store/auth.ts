import { create } from 'zustand';

import { authApi, type AuthResult, type Me } from '../api/auth';
import { ensureRefresh, setAuthExpiredHandler } from '../api/client';
import { clearAssetUrlCache } from '../hooks/useAssetUrl';
import { usePermStore } from './permissions';

interface AuthState {
  me: Me | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName: string): Promise<void>;
  logout(): Promise<void>;
  devLogin(): Promise<void>;
  applyAuth(r: AuthResult): void;
  reset(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  me: null,
  loading: true,
  error: null,
  applyAuth(r) {
    clearAssetUrlCache();
    set({ me: { user_id: r.user.id, email: r.user.email, workspace_id: r.workspace_id } });
  },
  reset() {
    clearAssetUrlCache();
    usePermStore.getState().reset();
    set({ me: null, loading: false, error: null });
  },
  async refresh() {
    set({ loading: true, error: null });
    try {
      if (!(await ensureRefresh())) throw new Error('session unavailable');
      const me = await authApi.me();
      clearAssetUrlCache();
      set({ me, loading: false });
    } catch {
      clearAssetUrlCache();
      usePermStore.getState().reset();
      set({ me: null, loading: false });
    }
  },
  async login(email, password) {
    set({ error: null });
    const r = await authApi.login(email, password);
    clearAssetUrlCache();
    set({ me: { user_id: r.user.id, email: r.user.email, workspace_id: r.workspace_id } });
  },
  async register(email, password, displayName) {
    set({ error: null });
    const r = await authApi.register(email, password, displayName);
    clearAssetUrlCache();
    set({ me: { user_id: r.user.id, email: r.user.email, workspace_id: r.workspace_id } });
  },
  async logout() {
    try {
      await authApi.logout();
    } finally {
      clearAssetUrlCache();
      usePermStore.getState().reset();
      set({ me: null });
    }
  },
  async devLogin() {
    set({ error: null });
    const r = await authApi.devLogin();
    clearAssetUrlCache();
    set({ me: { user_id: r.user.id, email: r.user.email, workspace_id: r.workspace_id } });
  },
}));

// When the opaque session can't be refreshed, client.ts calls this to drop auth
// state; AuthGate then bounces to /auth on the next render.
setAuthExpiredHandler(() => useAuthStore.getState().reset());
