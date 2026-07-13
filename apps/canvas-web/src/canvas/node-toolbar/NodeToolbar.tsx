import { useMemo, useState } from 'react';

import { canvasApi } from '../../api/canvas';
import { scriptApi } from '../../api/script';
import { getSchema } from '../../nodes/registry';
import type { PillActionDef } from '../../nodes/types';
import { toast } from '../../ui';
import { useCanvasStore } from '../canvas-state';
import { useCanvasUI } from '../ui-state';
import { useNodeRunner } from '../hooks/useNodeRunner';
import { useSelectedNodeAnchor } from '../hooks/useSelectedNodeAnchor';
import './NodeToolbar.css';

interface Props {
  projectId: string;
  onEdit?(nodeId: string): void;
}

/**
 * TEMP (open-source ship): only expose implemented toolbar actions.
 * Schema.pillActions still lists outpaint / upscale / etc. for later — do NOT delete them.
 * Re-enable by widening this allow-list once tools have settings + wired models.
 */
const VISIBLE_PILL_ACTION_IDS = new Set(['regenerate']);

function visiblePillActions(actions: PillActionDef[]): PillActionDef[] {
  return actions.filter((a) => VISIBLE_PILL_ACTION_IDS.has(a.id));
  // Parked (not distinct tools yet — they currently just re-submit gen):
  // outpaint, bg_remove, upscale, edit, split_shots, frame_capture,
  // rewrite, translate, summarize, optimize, extract_*, generate_storyboard, …
}

/** Floating action toolbar that hovers ~12px above the currently selected node.
 * Tracks pan / zoom / move / aspect-ratio via useSelectedNodeAnchor. */
export default function NodeToolbar({ projectId, onEdit: _onEdit }: Props) {
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const resizing = useCanvasUI((s) => s.resizing);
  const dragging = useCanvasUI((s) => s.dragging);
  const canEdit = useCanvasUI((s) => s.canEdit);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === selectedId));
  const schema = useMemo(() => (node ? getSchema(node.type ?? '') : null), [node]);
  const runner = useNodeRunner();
  const [busy, setBusy] = useState(false);
  const anchor = useSelectedNodeAnchor('top');
  const actions = useMemo(
    () => (schema ? visiblePillActions(schema.pillActions) : []),
    [schema],
  );

  // Hide entirely when no visible actions (e.g. asset_input) or read-only.
  if (!node || !schema || !anchor || resizing || dragging || !canEdit || actions.length === 0) return null;

  const dispatchAction = async (actionId: string) => {
    // TEMP: NodeDetailPanel edit entry parked — do NOT delete.
    // if (actionId === 'edit') {
    //   onEdit?.(node.id);
    //   return;
    // }
    if (actionId === 'edit') return;
    if (node.type === 'script_input') {
      const raw = (node.data as { raw_text?: string }).raw_text ?? '';
      if (!raw.trim()) {
        toast.warning('请先粘贴剧本');
        return;
      }
      const body = { project_id: projectId, script_node_id: node.id, raw_text: raw };
      setBusy(true);
      try {
        if (actionId === 'optimize') {
          const r = await scriptApi.optimize(body);
          useCanvasStore
            .getState()
            .patchNodeData(node.id, { optimized_text: r.optimized_text } as never);
          await canvasApi.updateNode(projectId, node.id, {
            data: { optimized_text: r.optimized_text },
          });
        } else if (actionId === 'extract_characters') await scriptApi.extractCharacters(body);
        else if (actionId === 'extract_scenes') await scriptApi.extractScenes(body);
        else if (actionId === 'extract_props') await scriptApi.extractProps(body);
        else if (actionId === 'generate_storyboard') await scriptApi.generateStoryboard(body);
        if (actionId !== 'optimize') {
          const fresh = await canvasApi.full(projectId);
          useCanvasStore.getState().hydrate(fresh);
        }
        toast.success('已完成');
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (node.type === 'storyboard_shot') {
      const target =
        actionId === 'generate_video'
          ? 'video'
          : actionId === 'generate_image'
            ? 'image'
            : ((node.data as { target?: string }).target ?? 'image');
      useCanvasStore.getState().patchNodeData(node.id, { target } as never);
      await canvasApi
        .updateNode(projectId, node.id, { data: { target } })
        .catch((e) => toast.error((e as Error).message || '更新失败'));
    }
    runner.submit(node.id, projectId);
  };

  return (
    <div
      className="node-toolbar"
      style={{
        left: anchor.screenX,
        top: anchor.screenY,
        transform: 'translate(-50%, calc(-100% - 12px))',
      }}
    >
      {/* TEMP: opens node-detail-backdrop — parked until detail editor is ready. Do NOT delete.
      <button
        type="button"
        className="node-toolbar__btn node-toolbar__btn--edit"
        onClick={() => dispatchAction('edit')}
        title="编辑提示词"
      >
        ✎
      </button>
      */}
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`node-toolbar__btn${
            a.id === 'regenerate' || a.id === 'generate_storyboard'
              ? ' node-toolbar__btn--primary'
              : ''
          }`}
          disabled={busy}
          onClick={() => dispatchAction(a.id)}
        >
          {a.icon ? <span className="node-toolbar__icon">{a.icon}</span> : null}
          {busy ? `${a.label}…` : a.label}
        </button>
      ))}
    </div>
  );
}
