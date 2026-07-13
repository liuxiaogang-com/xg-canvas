import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';
type Resolved = 'light' | 'dark';

const KEY = 'xgcanvas-theme';

function systemTheme(): Resolved {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(mode: ThemeMode): Resolved {
  return mode === 'system' ? systemTheme() : mode;
}

function apply(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolve(mode);
}

function readSaved(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* ignore */
  }
  return 'dark';
}

interface ThemeState {
  mode: ThemeMode;
  /** the resolved 'light'|'dark' actually applied (tracks system changes). */
  resolved: Resolved;
  setMode(mode: ThemeMode): void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: readSaved(),
  resolved: resolve(readSaved()),
  setMode(mode) {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
    apply(mode);
    set({ mode, resolved: resolve(mode) });
  },
}));

/** Apply the saved theme on boot + keep 'system' mode in sync with the OS. */
export function initTheme(): void {
  apply(useThemeStore.getState().mode);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (useThemeStore.getState().mode === 'system') {
      apply('system');
      useThemeStore.setState({ resolved: systemTheme() });
    }
  });
}
