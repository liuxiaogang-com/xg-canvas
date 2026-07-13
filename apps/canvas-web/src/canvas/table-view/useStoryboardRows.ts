import { useMemo } from 'react';
import type { Node } from '@xyflow/react';

import { useCanvasStore } from '../canvas-state';
import type { CanvasNodeData } from '../../nodes/types';
import type { StoryboardShotData } from '../../nodes/storyboard_shot';

export interface StoryboardRow {
  id: string;
  shot_no: number;
  summary: string;
  dialogue: string;
  prompt: string;
  duration_sec: number;
  target: 'image' | 'video';
  status: string;
  output_asset_id: string | null;
  characters: string[];
  scene: string | null;
  props: string[];
  raw: Node<CanvasNodeData>;
}

export function useStoryboardRows(): StoryboardRow[] {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  return useMemo(() => buildRows(nodes, edges), [nodes, edges]);
}

function buildRows(
  nodes: Node<CanvasNodeData>[],
  edges: { source: string; target: string; targetHandle?: string | null }[],
): StoryboardRow[] {
  const shots = nodes.filter((n) => n.type === 'storyboard_shot');
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return shots
    .map((shot) => {
      const d = (shot.data ?? {}) as StoryboardShotData & CanvasNodeData;
      const incoming = edges.filter((e) => e.target === shot.id);
      const characters = pickNames(incoming, byId, 'characters', 'entity_character');
      const props = pickNames(incoming, byId, 'props', 'entity_prop');
      const sceneId = incoming.find((e) => e.targetHandle === 'scene')?.source;
      const sceneName = sceneId
        ? ((byId.get(sceneId)?.data as { name?: string } | undefined)?.name ?? null)
        : null;
      return {
        id: shot.id,
        shot_no: d.shot_no ?? 0,
        summary: d.summary ?? '',
        dialogue: d.dialogue ?? '',
        prompt: d.prompt ?? '',
        duration_sec: d.duration_sec ?? 5,
        target: (d.target as 'image' | 'video') ?? 'image',
        status: (d.status as string) ?? 'idle',
        output_asset_id: (d.output_asset_id as string) ?? null,
        characters,
        scene: sceneName,
        props,
        raw: shot,
      };
    })
    .sort((a, b) => a.shot_no - b.shot_no);
}

function pickNames(
  edges: { source: string; targetHandle?: string | null }[],
  byId: Map<string, Node<CanvasNodeData>>,
  handle: string,
  type: string,
): string[] {
  return edges
    .filter((e) => e.targetHandle === handle)
    .map((e) => byId.get(e.source))
    .filter((n) => n && n.type === type)
    .map((n) => ((n!.data as { name?: string }).name ?? '').trim())
    .filter(Boolean);
}
