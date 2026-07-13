import { useMemo, useState } from 'react';
import { GlassPill } from '@xgcanvas/ui-kit';

import { toast } from '../../ui';

import { canvasApi } from '../../api/canvas';
import { scriptApi } from '../../api/script';
import { getSchema } from '../../nodes/registry';
import type { PillActionDef } from '../../nodes/types';
import { useCanvasStore } from '../canvas-state';
import { useNodeRunner } from '../hooks/useNodeRunner';
import ActionChip from './ActionChip';
import ContextChip from './ContextChip';
import QuickAddInput from './empty-state/QuickAddInput';

interface Props {
  projectId: string;
}

/** Keep in sync with NodeToolbar — only ship implemented actions for open-source. */
const VISIBLE_PILL_ACTION_IDS = new Set(['regenerate']);

function visiblePillActions(actions: PillActionDef[]): PillActionDef[] {
  return actions.filter((a) => VISIBLE_PILL_ACTION_IDS.has(a.id));
}

export default function BottomPill({ projectId }: Props) {
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === selectedId));
  const schema = useMemo(() => (node ? getSchema(node.type ?? '') : null), [node]);
  const runner = useNodeRunner();
  const [busy, setBusy] = useState(false);
  const actions = useMemo(
    () => (schema ? visiblePillActions(schema.pillActions) : []),
    [schema],
  );

  const dispatchAction = async (actionId: string) => {
    if (!node || !schema) return;
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
          useCanvasStore.getState().patchNodeData(node.id, { optimized_text: r.optimized_text } as never);
          await canvasApi.updateNode(projectId, node.id, { data: { optimized_text: r.optimized_text } });
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
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-[1100px] w-[calc(100%-160px)]">
      <GlassPill style={{ padding: '8px 12px', display: 'flex', width: '100%' }}>
        {node && schema ? (
          <>
            <ContextChip
              title={schema.title}
              subtitle={(node.data as { prompt?: string; name?: string }).prompt?.slice(0, 24) ?? (node.data as { name?: string }).name ?? ''}
            />
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {actions.map((a) => (
                <ActionChip
                  key={a.id}
                  label={busy ? `${a.label}…` : a.label}
                  icon={a.icon}
                  active={a.id === 'regenerate' || a.id === 'generate_storyboard'}
                  onClick={() => dispatchAction(a.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <QuickAddInput projectId={projectId} />
        )}
      </GlassPill>
    </div>
  );
}
