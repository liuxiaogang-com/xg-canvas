import { useEffect, useMemo, useState } from 'react';
import type { PromptMentionRef } from '@xgcanvas/shared-types';

import { assetApi, type AssetRecord } from '../../api/asset';
import { entityApi, type EntityRecord } from '../../api/entity';
import { assetToMentionCandidate, cleanMentionLabel, type MentionCandidate } from '../../generation/prompt-mentions';
import { getSchema } from '../../nodes/registry';
import { useCanvasStore } from '../canvas-state';

export function useNodeMentionCandidates(projectId: string, nodeId: string): MentionCandidate[] {
  const nodes = useCanvasStore((state) => state.nodes);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      assetApi.list({ project_id: projectId, limit: 80 }),
      entityApi.list(projectId),
    ])
      .then(([assetList, entityList]) => {
        if (cancelled) return;
        setAssets(assetList);
        setEntities(entityList);
      })
      .catch(() => {
        if (cancelled) return;
        setAssets([]);
        setEntities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return useMemo(() => {
    const assetCandidates = assets.map(assetToMentionCandidate);
    const entityCandidates = entities.map(entityToCandidate);
    const nodeCandidates = nodes
      .filter((node) => node.id !== nodeId)
      .map((node): MentionCandidate => {
        const schema = getSchema(node.type ?? '');
        const output = schema?.outputs[0]?.type;
        const label = cleanMentionLabel(
          String(node.data.title || node.data.name || schema?.title || node.type || '节点'),
        );
        const assetId = typeof node.data.output_asset_id === 'string' ? node.data.output_asset_id : undefined;
        return {
          key: `node:${node.id}`,
          label,
          subtitle: schema?.title ? `节点 · ${schema.title}` : '节点',
          tone: 'node',
          ref: {
            kind: 'node',
            id: node.id,
            node_type: node.type,
            output_type: outputToReferenceType(output),
            asset_type: outputToAssetType(output),
            asset_id: assetId,
          },
        };
      });
    return [...entityCandidates, ...nodeCandidates, ...assetCandidates];
  }, [assets, entities, nodeId, nodes]);
}

function entityToCandidate(entity: EntityRecord): MentionCandidate {
  const assetId = entity.generated_asset_id ?? entity.ref_asset_ids[0];
  return {
    key: `entity:${entity.id}`,
    label: cleanMentionLabel(entity.name),
    subtitle: `${entityTypeLabel(entity.type)} · 实体`,
    tone: `entity-${entity.type}`,
    ref: {
      kind: 'entity',
      id: entity.id,
      entity_kind: entity.type,
      asset_id: assetId,
      asset_type: assetId ? 'image' : undefined,
    },
  };
}

function outputToReferenceType(output: string | undefined): PromptMentionRef['output_type'] | undefined {
  if (output === 'image' || output === 'image_list' || output === 'video' || output === 'audio' || output === 'json') {
    return output;
  }
  if (output === 'mask') return 'mask';
  if (output === 'text') return 'text';
  return undefined;
}

function outputToAssetType(output: string | undefined): PromptMentionRef['asset_type'] | undefined {
  if (output === 'image' || output === 'image_list' || output === 'mask') return 'image';
  if (output === 'video') return 'video';
  if (output === 'audio') return 'audio';
  if (output === 'json') return 'json';
  if (output === 'text') return 'text';
  return undefined;
}

function entityTypeLabel(type: EntityRecord['type']): string {
  if (type === 'character') return '角色';
  if (type === 'scene') return '场景';
  if (type === 'prop') return '物品';
  return '分镜';
}
