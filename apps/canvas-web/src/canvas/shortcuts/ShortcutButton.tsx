import { useState } from 'react';
import { createPortal } from 'react-dom';

import ShortcutPanel from './ShortcutPanel';

/** Floating dock button that opens the shortcut settings panel.
 *  The panel is portaled to <body> so the dock's centering transform doesn't
 *  break its fixed-position overlay. */
export default function ShortcutButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cdock__btn" title="快捷键" aria-label="快捷键" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
        </svg>
      </button>
      {open ? createPortal(<ShortcutPanel onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}
