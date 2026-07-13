import { useEffect, useState, type RefObject } from 'react';

import type { LibraryEntryRecord } from '../../api/library';

export interface PanelPos {
  left: number;
  top: number;
}

const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = 420;
const GAP = 8;
const VIEWPORT_PAD = 8;

export function computePanelPos(
  anchor: HTMLElement | null | undefined,
  panel: HTMLElement | null,
): PanelPos | null {
  if (!anchor) return { left: VIEWPORT_PAD, top: VIEWPORT_PAD };
  const rect = anchor.getBoundingClientRect();
  const panelH = Math.min(panel?.offsetHeight || PANEL_MAX_HEIGHT, PANEL_MAX_HEIGHT);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceAbove = rect.top - VIEWPORT_PAD;
  const spaceBelow = vh - rect.bottom - VIEWPORT_PAD;
  const preferAbove = spaceAbove >= panelH + GAP || spaceAbove >= spaceBelow;
  let top = preferAbove ? rect.top - GAP - panelH : rect.bottom + GAP;
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;
  if (top + panelH > vh - VIEWPORT_PAD) {
    top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - panelH);
  }
  let left = rect.left;
  if (left + PANEL_WIDTH > vw - VIEWPORT_PAD) left = vw - VIEWPORT_PAD - PANEL_WIDTH;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
  return { left, top };
}

export function usePopoverFocus(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  anchorRef?: RefObject<HTMLElement | null>,
  returnFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const anchor = anchorRef?.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : (anchor ?? null);
    const previousExpanded = anchor?.getAttribute('aria-expanded') ?? null;
    const previousHasPopup = anchor?.getAttribute('aria-haspopup') ?? null;
    anchor?.setAttribute('aria-expanded', 'true');
    anchor?.setAttribute('aria-haspopup', 'dialog');
    const focusRaf = requestAnimationFrame(() => {
      const preferred =
        panel?.querySelector<HTMLElement>('.rp__search') ??
        panel?.querySelector<HTMLElement>('.rp__upload-button') ??
        panel?.querySelector<HTMLElement>('.rp__close');
      preferred?.focus();
    });
    return () => {
      cancelAnimationFrame(focusRaf);
      restoreAttribute(anchor, 'aria-expanded', previousExpanded);
      restoreAttribute(anchor, 'aria-haspopup', previousHasPopup);
      const active = document.activeElement;
      const shouldRestore = active === document.body || !!(active && panel?.contains(active));
      requestAnimationFrame(() => {
        const current = document.activeElement;
        if (shouldRestore && current === document.body) {
          const target = [previousFocus, returnFocusRef?.current, anchorRef?.current].find(
            isFocusable,
          );
          target?.focus();
        }
      });
    };
  }, [open, panelRef, anchorRef, returnFocusRef]);
}

function isFocusable(element: HTMLElement | null | undefined): element is HTMLElement {
  return !!element?.isConnected && !element.matches(':disabled, [aria-disabled="true"]');
}

function restoreAttribute(
  element: HTMLElement | null | undefined,
  name: string,
  value: string | null,
): void {
  if (!element) return;
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function kindLabel(kind: string): string {
  if (kind === 'character') return '人物';
  if (kind === 'voice') return '音色';
  if (kind === 'style') return '风格';
  return kind;
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function mergeLibraryRows(rows: LibraryEntryRecord[]): LibraryEntryRecord[] {
  const unique = new Map<string, LibraryEntryRecord>();
  rows.forEach((row) => unique.set(row.id, row));
  return [...unique.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
