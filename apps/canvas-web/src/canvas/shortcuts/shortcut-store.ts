import { create } from 'zustand';

import { SHORTCUTS, type ShortcutId } from './keymap';

const LKEY = 'xgcanvas-shortcuts';

function load(): Record<string, string> {
  try {
    const v = localStorage.getItem(LKEY);
    return v ? (JSON.parse(v) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function persist(v: Record<string, string>): void {
  try {
    localStorage.setItem(LKEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

interface ShortcutState {
  /** custom overrides only; missing id falls back to defaultKeys. */
  custom: Record<string, string>;
  keysFor(id: ShortcutId): string;
  /** id currently owning a combo, if any (for conflict detection). */
  ownerOf(combo: string): ShortcutId | null;
  rebind(id: ShortcutId, combo: string): void;
  reset(id: ShortcutId): void;
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  custom: load(),
  keysFor(id) {
    const def = SHORTCUTS.find((s) => s.id === id);
    return get().custom[id] ?? def?.defaultKeys ?? '';
  },
  ownerOf(combo) {
    if (!combo) return null;
    for (const s of SHORTCUTS) {
      if (get().keysFor(s.id) === combo) return s.id;
    }
    return null;
  },
  rebind(id, combo) {
    set((st) => {
      const next = { ...st.custom };
      // free the combo from any previous owner
      for (const s of SHORTCUTS) {
        const k = next[s.id] ?? SHORTCUTS.find((d) => d.id === s.id)?.defaultKeys;
        if (s.id !== id && k === combo) next[s.id] = '';
      }
      next[id] = combo;
      persist(next);
      return { custom: next };
    });
  },
  reset(id) {
    set((st) => {
      const next = { ...st.custom };
      delete next[id];
      persist(next);
      return { custom: next };
    });
  },
}));
