import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@xyflow/react';

import type { CanvasNodeData } from '../../nodes/types';
import { useCanvasStore } from '../canvas-state';

/** Fields that change the visual card size without NodeResizeControl. */
function sizeSignature(data: CanvasNodeData | undefined): string {
  if (!data) return '';
  return [
    data.ratio,
    data.aspect_ratio,
    data.width,
    data.media_width,
    data.media_height,
    data.media_type,
    data.output_asset_id,
  ]
    .map((v) => (v == null ? '' : String(v)))
    .join('|');
}

export interface SelectedNodeAnchor {
  nodeId: string;
  /** X center of the card, relative to `.canvas-shell`. */
  screenX: number;
  /** Top (anchor=top) or bottom (anchor=bottom) edge, relative to `.canvas-shell`. */
  screenY: number;
  width: number;
  height: number;
}

interface DomBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function readBox(selectedId: string, anchor: 'top' | 'bottom'): DomBox | null {
  const nodeEl = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(selectedId)}"]`,
  ) as HTMLElement | null;
  if (!nodeEl) return null;

  // Bottom chrome sits under the visual card; top chrome sits above the whole
  // nodewrap (label + card) so it doesn't cover the title.
  const target =
    anchor === 'bottom'
      ? ((nodeEl.querySelector('.nodecard') as HTMLElement | null) ?? nodeEl)
      : ((nodeEl.querySelector('.nodewrap') as HTMLElement | null) ?? nodeEl);

  const shell = document.querySelector('.canvas-shell') as HTMLElement | null;
  const pr = shell?.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const ox = pr?.left ?? 0;
  const oy = pr?.top ?? 0;
  return {
    left: r.left - ox,
    top: r.top - oy,
    right: r.right - ox,
    bottom: r.bottom - oy,
    width: r.width,
    height: r.height,
  };
}

/**
 * Anchor floating chrome (toolbar / inline form) to the selected node's real
 * DOM box. Uses getBoundingClientRect so CSS aspect-ratio changes are visible
 * immediately — React Flow `measured` often lags or stays locked after resize.
 */
export function useSelectedNodeAnchor(anchor: 'top' | 'bottom'): SelectedNodeAnchor | null {
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === selectedId) ?? null);
  const transform = useStore((s) => s.transform);
  const sig = sizeSignature(node?.data as CanvasNodeData | undefined);
  const [box, setBox] = useState<DomBox | null>(null);

  const measure = useCallback(() => {
    if (!selectedId) {
      setBox(null);
      return;
    }
    setBox(readBox(selectedId, anchor));
  }, [selectedId, anchor]);

  // Re-measure on select, pan/zoom, and size-affecting data changes.
  useEffect(() => {
    measure();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [measure, transform, sig]);

  // Keep tracking while the card's CSS box grows/shrinks (aspect-ratio etc.).
  useEffect(() => {
    if (!selectedId) return;
    const nodeEl = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(selectedId)}"]`,
    );
    if (!nodeEl) return;
    const card = nodeEl.querySelector('.nodecard') ?? nodeEl;
    const wrap = nodeEl.querySelector('.nodewrap') ?? nodeEl;
    const ro = new ResizeObserver(() => measure());
    ro.observe(card);
    if (wrap !== card) ro.observe(wrap);
    return () => ro.disconnect();
  }, [selectedId, measure]);

  if (!selectedId || !node || !box) return null;

  return {
    nodeId: selectedId,
    screenX: (box.left + box.right) / 2,
    screenY: anchor === 'bottom' ? box.bottom : box.top,
    width: box.width,
    height: box.height,
  };
}
