import type { ReactNode } from 'react';

import { useThemeStore, type ThemeMode } from '../store/theme';

const ICONS: Record<ThemeMode, ReactNode> = {
  system: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  light: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  dark: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
};

const ITEMS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: '跟随系统' },
  { mode: 'light', label: '亮色' },
  { mode: 'dark', label: '暗色' },
];

/** 3-way theme switch (follow-system / light / dark). Reuses the .seg segmented
 *  styles so it inherits the active theme. Place in page headers. */
export default function ThemeSwitch() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return (
    <div className="seg" role="group" aria-label="主题切换">
      {ITEMS.map((it) => (
        <button
          key={it.mode}
          type="button"
          title={it.label}
          aria-label={it.label}
          aria-pressed={mode === it.mode}
          className={`seg__btn seg__btn--icon${mode === it.mode ? ' seg__btn--active' : ''}`}
          onClick={() => setMode(it.mode)}
        >
          {ICONS[it.mode]}
        </button>
      ))}
    </div>
  );
}
