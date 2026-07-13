import { useEffect, useRef } from 'react';
import { useStore } from '@xyflow/react';

/**
 * Dot-grid backdrop rendered BEHIND the (transparent) React Flow surface. Two
 * layers share the same grid: a dim base everywhere, and a bright copy revealed
 * only around the cursor via a radial mask — so the dots brighten toward the
 * pointer and indicate its position. The grid is synced to React Flow's
 * pan/zoom so it lines up with the canvas. CSS vars are set imperatively to
 * avoid re-rendering anything heavier than this leaf.
 */
export default function CanvasBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const transform = useStore((s) => s.transform);

  // keep the grid aligned with the canvas pan/zoom
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const [tx, ty, z] = transform;
    el.style.setProperty('--bs', `${24 * z}px`);
    el.style.setProperty('--ox', `${tx}px`);
    el.style.setProperty('--oy', `${ty}px`);
    // dots and the cursor spotlight shrink as the canvas zooms out, so they
    // stay proportional instead of looking oversized at low zoom.
    el.style.setProperty('--dr', `${Math.max(0.6, Math.min(1.7, 1.1 * z))}px`);
    el.style.setProperty('--r', `${Math.max(80, Math.min(280, 200 * z))}px`);
  }, [transform]);

  // cursor spotlight (rAF-coalesced)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    const apply = () => {
      raf = 0;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="cv-backdrop" aria-hidden />;
}
